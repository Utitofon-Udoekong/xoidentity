import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { electrumEvents } from "@electrum-cash/application";
import { generateBip39Mnemonic, hexToBin, lockingBytecodeToCashAddress } from "@bitauth/libauth";
import {
  cashAddressFromPrivateKey,
  decodeCashAddress,
  nostrPubkeyFromPrivateKey,
  signBinding,
  verify,
  type IdentityBinding,
} from "@bchblaze/identity";
import { identityBindTemplate, payToBoundIdentityTemplate } from "@bchblaze/xo-templates";
import {
  Engine,
  XO_SUPPORTED_NETWORKS,
  type XOInvitationIdentifier,
} from "@xo-cash/engine";
import { p2pkhTemplate } from "@xo-cash/templates";

type Spendable = Awaited<ReturnType<Engine["listSpendableUnspentOutputs"]>>[number];

const APP_ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = resolve(APP_ROOT, ".xo");
const RESULT_PATH = resolve(APP_ROOT, "public", "mainnet-result.json");
const PENDING_PATH = resolve(DATA_DIR, "pending-broadcast.json");
const PAYMENT_SATOSHIS = 2_000n;
const BINDING_OUTPUT_SATOSHIS = 2_000n;
const RELAY_FEE_SATOSHIS = 1_500n;
const DUST_SATOSHIS = 546n;
const FUNDING_MINIMUM_SATOSHIS = 8_000n;
const FUNDING_SATOSHIS = 20_000n;
const EXPLORER = "https://blockchair.com/bitcoin-cash/transaction";

export interface MainnetClaim {
  name: "commitBinding" | "payBoundIdentity";
  txid: string;
  explorer: string;
}

export interface MainnetResult {
  network: "mainnet";
  fundingAddress: string;
  faucetTxid: null;
  boundAddress: string;
  binding: IdentityBinding;
  claims: MainnetClaim[];
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function p2pkhLockingHex(address: string): string {
  const decoded = decodeCashAddress(address);
  const lock = new Uint8Array(25);
  lock[0] = 0x76;
  lock[1] = 0xa9;
  lock[2] = 0x14;
  lock.set(decoded.hash, 3);
  lock[23] = 0x88;
  lock[24] = 0xac;
  return bytesToHex(lock);
}

function loadMnemonic(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  const path = resolve(DATA_DIR, "mnemonic.txt");
  const fromEnv = process.env.XO_MNEMONIC?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const phrase = generateBip39Mnemonic();
  writeFileSync(path, `${phrase}\n`, { encoding: "utf8" });
  return phrase;
}

function cashAddressFromLock(lockingHex: string): string {
  const decoded = lockingBytecodeToCashAddress({ bytecode: hexToBin(lockingHex), prefix: "bitcoincash" });
  if (typeof decoded === "string") throw new Error(decoded);
  return decoded.address;
}

function outpointBytes(hash: Spendable["outpointTransactionHash"]): Uint8Array {
  if (typeof hash === "string") return hexToBin(hash);
  return hash;
}

function outpointHex(hash: Spendable["outpointTransactionHash"]): string {
  return typeof hash === "string" ? hash : bytesToHex(hash);
}

interface PendingBroadcast {
  binding: IdentityBinding;
  commitTxid: string;
}

function readPending(): PendingBroadcast | undefined {
  if (!existsSync(PENDING_PATH)) return undefined;
  return JSON.parse(readFileSync(PENDING_PATH, "utf8")) as PendingBroadcast;
}

function writePending(pending: PendingBroadcast): void {
  writeFileSync(PENDING_PATH, `${JSON.stringify(pending, null, 2)}\n`);
}

async function refreshWallet(engine: Engine): Promise<void> {
  const tracked = await engine.listScriptHashes();
  for (const entry of tracked) {
    electrumEvents.emit("ScriptHashUpdate", {
      scriptHash: entry.scriptHash,
      status: `refresh-${Date.now()}-${entry.scriptHash}`,
    });
  }
}

async function waitForOutput(
  engine: Engine,
  minimum: bigint,
  templateIdentifier: Spendable["templateIdentifier"],
  outpointIndex?: number,
): Promise<Spendable> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const outputs = await engine.listSpendableUnspentOutputs({ templateIdentifier });
    const ready = outputs.find((output) => (
      BigInt(output.valueSatoshis) >= minimum
      && (outpointIndex === undefined || output.outpointIndex === outpointIndex)
    ));
    if (ready !== undefined) return ready;
    await refreshWallet(engine);
    await new Promise((resolveWait) => setTimeout(resolveWait, 4_000));
  }
  throw new Error("Timed out waiting for a mainnet output");
}

async function assertInvitationReady(engine: Engine, invitationIdentifier: XOInvitationIdentifier): Promise<void> {
  const missing = await engine.listMissingRequirements(invitationIdentifier);
  const variableGaps = [
    ...(missing.templateRequirements.variables ?? []),
    ...Object.values(missing.templateRequirements.roles ?? {}).flatMap((role) => role.variables ?? []),
  ];
  if (variableGaps.length > 0 || missing.participants.length > 0 || missing.inputsMissingSignatures.length > 0) {
    throw new Error(`Invitation ${invitationIdentifier} is incomplete: ${JSON.stringify(missing)}`);
  }
}

async function executeInvitation(
  engine: Engine,
  invitationIdentifier: XOInvitationIdentifier,
  outputIdentifiers: string[],
  change: { valueSatoshis: bigint; lockingBytecode: string },
): Promise<string> {
  await engine.appendInvitation(invitationIdentifier, {
    outputs: [
      ...outputIdentifiers.map((outputIdentifier) => ({ outputIdentifier })),
      { valueSatoshis: change.valueSatoshis, lockingBytecode: hexToBin(change.lockingBytecode) },
    ],
  });
  const indexes = await engine.listOwnInputIndexes(invitationIdentifier);
  for (const inputIndex of indexes) {
    await engine.signInvitation(invitationIdentifier, inputIndex);
  }
  await assertInvitationReady(engine, invitationIdentifier);
  const executed = await engine.executeAction(invitationIdentifier, { broadcastTransaction: true });
  const hash = executed.builtTransaction.transactionHash;
  return typeof hash === "string" ? hash : bytesToHex(hash);
}

async function payBound(
  engine: Engine,
  templateIdentifier: Spendable["templateIdentifier"],
  coin: Spendable,
  payerLock: string,
  paymentSatoshis: bigint,
  boundLockingScript: string,
  boundBindingId: string,
): Promise<string> {
  const payIntent = payToBoundIdentityTemplate.start.find((intent) => intent.action === "payBoundIdentity");
  if (payIntent === undefined) throw new Error("payBoundIdentity is not a start action");
  const pay = await engine.createInvitation({
    templateIdentifier,
    actionIdentifier: "payBoundIdentity",
    intent: payIntent,
    variables: [
      { variableIdentifier: "paymentSatoshis", roleIdentifier: "payer", value: paymentSatoshis },
      { variableIdentifier: "boundLockingScript", roleIdentifier: "payer", value: boundLockingScript },
      { variableIdentifier: "boundBindingId", roleIdentifier: "payer", value: boundBindingId },
    ],
    inputs: [{
      outpointTransactionHash: outpointBytes(coin.outpointTransactionHash),
      outpointIndex: coin.outpointIndex,
    }],
  });
  return executeInvitation(engine, pay.invitation.invitationIdentifier, ["paymentOutput"], {
    valueSatoshis: BigInt(coin.valueSatoshis) - paymentSatoshis - RELAY_FEE_SATOSHIS,
    lockingBytecode: payerLock,
  });
}

export async function runMainnet(): Promise<MainnetResult> {
  const mnemonic = loadMnemonic();
  const engine = await Engine.create(mnemonic, {
    network: XO_SUPPORTED_NETWORKS.mainnet,
    databasePath: DATA_DIR,
  });
  try {
    const identity = await engine.importTemplate(identityBindTemplate);
    const payment = await engine.importTemplate(payToBoundIdentityTemplate);
    await engine.importTemplate(p2pkhTemplate);

    await engine.setDefaultPolicies({
      change: { templateIdentifier: identity.templateIdentifier },
      receive: { templateIdentifier: identity.templateIdentifier },
      address: { templateIdentifier: identity.templateIdentifier },
    });
    const fundingLock = await engine.generateLockingBytecodeFromDefaultPolicy("receive");
    const fundingAddress = cashAddressFromLock(fundingLock);

    await engine.setDefaultPolicies({
      change: { templateIdentifier: payment.templateIdentifier },
      receive: { templateIdentifier: payment.templateIdentifier },
      address: { templateIdentifier: payment.templateIdentifier },
    });
    const payerLock = await engine.generateLockingBytecodeFromDefaultPolicy("receive");

    const pending = readPending();
    let binding: IdentityBinding;
    let boundAddress: string;
    let commitTxid: string;
    if (pending !== undefined) {
      binding = pending.binding;
      boundAddress = binding.statement.bchAddress;
      commitTxid = pending.commitTxid;
      console.log(`commit ${commitTxid}`);
    } else {
      await engine.setDefaultPolicies({
        change: { templateIdentifier: identity.templateIdentifier },
        receive: { templateIdentifier: identity.templateIdentifier },
        address: { templateIdentifier: identity.templateIdentifier },
      });
      let funded = (await engine.listSpendableUnspentOutputs({ templateIdentifier: identity.templateIdentifier }))
        .find((output) => BigInt(output.valueSatoshis) >= FUNDING_MINIMUM_SATOSHIS);
      if (funded === undefined) {
        const stranded = (await engine.listSpendableUnspentOutputs({ templateIdentifier: payment.templateIdentifier }))
          .find((output) => BigInt(output.valueSatoshis) >= FUNDING_MINIMUM_SATOSHIS);
        if (stranded !== undefined) {
          const moveSatoshis = BigInt(stranded.valueSatoshis) - RELAY_FEE_SATOSHIS - DUST_SATOSHIS;
          console.log(`The earlier commit left ${stranded.valueSatoshis} satoshis in this wallet. Moving ${moveSatoshis} satoshis to the funding address.`);
          const moved = await payBound(
            engine,
            payment.templateIdentifier,
            stranded,
            payerLock,
            moveSatoshis,
            fundingLock,
            bytesToHex(randomBytes(32)),
          );
          console.log(`move ${moved}`);
          funded = await waitForOutput(engine, FUNDING_MINIMUM_SATOSHIS, identity.templateIdentifier, 0);
        } else {
          console.log(`Send ${FUNDING_SATOSHIS} satoshis to ${fundingAddress} on mainnet.`);
          funded = await waitForOutput(engine, FUNDING_MINIMUM_SATOSHIS, identity.templateIdentifier);
        }
      }
      if (funded.outpointIndex !== 0) {
        const consolidateIntent = identityBindTemplate.start.find((intent) => intent.action === "consolidate");
        if (consolidateIntent === undefined) throw new Error("consolidate is not a start action");
        const consolidated = await engine.createInvitation({
          templateIdentifier: identity.templateIdentifier,
          actionIdentifier: "consolidate",
          intent: consolidateIntent,
          inputs: [{
            outpointTransactionHash: outpointBytes(funded.outpointTransactionHash),
            outpointIndex: funded.outpointIndex,
          }],
        });
        const consolidateTxid = await executeInvitation(engine, consolidated.invitation.invitationIdentifier, [], {
          valueSatoshis: BigInt(funded.valueSatoshis) - RELAY_FEE_SATOSHIS,
          lockingBytecode: fundingLock,
        });
        console.log(`consolidate ${consolidateTxid}`);
        funded = await waitForOutput(engine, FUNDING_MINIMUM_SATOSHIS, identity.templateIdentifier, 0);
      }

      const boundKey = randomBytes(32);
      const nostrKey = randomBytes(32);
      boundAddress = cashAddressFromPrivateKey(boundKey, "mainnet");
      binding = signBinding(
        {
          bchAddress: boundAddress,
          bchNetwork: "mainnet",
          nostrPubkey: nostrPubkeyFromPrivateKey(nostrKey),
        },
        { bchPrivateKey: boundKey, nostrPrivateKey: nostrKey },
      );
      const checked = verify(binding);
      if (!checked.ok) throw new Error(checked.details.join(" "));

      const commitIntent = identityBindTemplate.start.find((intent) => intent.action === "commitBinding");
      if (commitIntent === undefined) throw new Error("commitBinding is not a start action");
      const commit = await engine.createInvitation({
        templateIdentifier: identity.templateIdentifier,
        actionIdentifier: "commitBinding",
        intent: commitIntent,
        variables: [
          { variableIdentifier: "nostrPubkey", roleIdentifier: "holder", value: binding.statement.nostrPubkey },
          { variableIdentifier: "bindingId", roleIdentifier: "holder", value: binding.statement.bindingId },
          { variableIdentifier: "genesisCategory", roleIdentifier: "holder", value: outpointHex(funded.outpointTransactionHash) },
        ],
        inputs: [{
          outpointTransactionHash: outpointBytes(funded.outpointTransactionHash),
          outpointIndex: funded.outpointIndex,
        }],
      });
      await engine.appendInvitation(commit.invitation.invitationIdentifier, {
        outputs: [
          { outputIdentifier: "bindingMarkOutput" },
          {
            valueSatoshis: BigInt(funded.valueSatoshis) - BINDING_OUTPUT_SATOSHIS - RELAY_FEE_SATOSHIS,
            lockingBytecode: hexToBin(payerLock),
          },
        ],
      });
      const commitIndexes = await engine.listOwnInputIndexes(commit.invitation.invitationIdentifier);
      for (const inputIndex of commitIndexes) {
        await engine.signInvitation(commit.invitation.invitationIdentifier, inputIndex);
      }
      await assertInvitationReady(engine, commit.invitation.invitationIdentifier);
      const commitExecuted = await engine.executeAction(commit.invitation.invitationIdentifier, { broadcastTransaction: true });
      const commitHash = commitExecuted.builtTransaction.transactionHash;
      commitTxid = typeof commitHash === "string" ? commitHash : bytesToHex(commitHash);
      console.log(`commit ${commitTxid}`);
      writePending({ binding, commitTxid });
    }

    const change = await waitForOutput(engine, PAYMENT_SATOSHIS + RELAY_FEE_SATOSHIS, payment.templateIdentifier);
    const payTxid = await payBound(
      engine,
      payment.templateIdentifier,
      change,
      payerLock,
      PAYMENT_SATOSHIS,
      p2pkhLockingHex(boundAddress),
      binding.statement.bindingId,
    );
    console.log(`pay ${payTxid}`);
    if (existsSync(PENDING_PATH)) unlinkSync(PENDING_PATH);

    const result: MainnetResult = {
      network: "mainnet",
      fundingAddress,
      faucetTxid: null,
      boundAddress,
      binding,
      claims: [
        { name: "commitBinding", txid: commitTxid, explorer: `${EXPLORER}/${commitTxid}` },
        { name: "payBoundIdentity", txid: payTxid, explorer: `${EXPLORER}/${payTxid}` },
      ],
    };
    mkdirSync(resolve(APP_ROOT, "public"), { recursive: true });
    writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    try {
      await engine.stop();
    } catch (stopError) {
      const message = stopError instanceof Error ? stopError.message : String(stopError);
      if (!message.includes("blockchain.transaction.subscribe")) throw stopError;
    }
  }
}
