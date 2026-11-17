import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
const RESULT_PATH = resolve(APP_ROOT, "public", "chipnet-result.json");
const PAYMENT_SATOSHIS = 2_000n;
const BINDING_OUTPUT_SATOSHIS = 2_000n;
const RELAY_FEE_SATOSHIS = 1_500n;
const EXPLORER = "https://explorer.selene.cash/tx";

export interface ChipnetClaim {
  name: "commitBinding" | "payBoundIdentity";
  txid: string;
  explorer: string;
}

export interface ChipnetResult {
  network: "chipnet";
  fundingAddress: string;
  faucetTxid: string | null;
  boundAddress: string;
  binding: IdentityBinding;
  claims: ChipnetClaim[];
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
  const decoded = lockingBytecodeToCashAddress({ bytecode: hexToBin(lockingHex), prefix: "bchtest" });
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

async function faucet(address: string): Promise<string> {
  const poolResponse = await fetch("https://chipnet.bch.ninja/api/pool");
  const pool = await poolResponse.json() as { max?: string; error?: string };
  if (!poolResponse.ok || pool.max === undefined) throw new Error(pool.error ?? "Chipnet faucet pool is unavailable");
  const sats = Math.min(20_000, Number(pool.max));
  if (sats < 8_000) throw new Error(`Chipnet faucet can only send ${pool.max} sats`);

  const challengeResponse = await fetch("https://chipnet.bch.ninja/api/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, sats: String(sats) }),
  });
  const challenge = await challengeResponse.json() as {
    payload?: string;
    signature?: string;
    target?: string;
    expires?: number;
    error?: string;
  };
  if (!challengeResponse.ok || !challenge.payload || !challenge.signature || !challenge.target) {
    throw new Error(challenge.error ?? `Faucet challenge failed (${challengeResponse.status})`);
  }
  const target = BigInt(`0x${challenge.target}`);
  const expires = challenge.expires ?? Date.now() + 180_000;
  let nonce = 0n;
  let digest = createHash("sha256").update(`${challenge.payload}:${nonce}`).digest("hex");
  while (BigInt(`0x${digest}`) > target) {
    if (Date.now() > expires) throw new Error("Faucet challenge expired");
    nonce += 1n;
    digest = createHash("sha256").update(`${challenge.payload}:${nonce}`).digest("hex");
  }
  const claimResponse = await fetch("https://chipnet.bch.ninja/api/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payload: challenge.payload,
      signature: challenge.signature,
      nonce: nonce.toString(),
    }),
  });
  const claim = await claimResponse.json() as { txid?: string; error?: string };
  if (!claimResponse.ok || !claim.txid) throw new Error(claim.error ?? `Faucet claim failed (${claimResponse.status})`);
  return claim.txid;
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 4_000));
  }
  throw new Error("Timed out waiting for a chipnet output");
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

export async function runChipnet(): Promise<ChipnetResult> {
  const engine = await Engine.create(loadMnemonic(), {
    network: XO_SUPPORTED_NETWORKS.chipnet,
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

    let faucetTxid: string | null = null;
    let funded = (await engine.listSpendableUnspentOutputs())
      .find((output) => BigInt(output.valueSatoshis) >= 8_000n);
    if (funded === undefined) {
      faucetTxid = await faucet(fundingAddress);
      console.log(`faucet ${faucetTxid}`);
      funded = await waitForOutput(engine, 8_000n, identity.templateIdentifier);
    }

    await engine.setDefaultPolicies({
      change: { templateIdentifier: identity.templateIdentifier },
      receive: { templateIdentifier: identity.templateIdentifier },
      address: { templateIdentifier: identity.templateIdentifier },
    });
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
      funded = await waitForOutput(engine, 8_000n, identity.templateIdentifier, 0);
    }

    const boundKey = randomBytes(32);
    const nostrKey = randomBytes(32);
    const boundAddress = cashAddressFromPrivateKey(boundKey, "chipnet");
    const binding = signBinding(
      {
        bchAddress: boundAddress,
        bchNetwork: "chipnet",
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
    const commitTxid = typeof commitHash === "string" ? commitHash : bytesToHex(commitHash);
    console.log(`commit ${commitTxid}`);

    const change = await waitForOutput(engine, PAYMENT_SATOSHIS + 1_500n, payment.templateIdentifier);
    const payIntent = payToBoundIdentityTemplate.start.find((intent) => intent.action === "payBoundIdentity");
    if (payIntent === undefined) throw new Error("payBoundIdentity is not a start action");
    const pay = await engine.createInvitation({
      templateIdentifier: payment.templateIdentifier,
      actionIdentifier: "payBoundIdentity",
      intent: payIntent,
      variables: [
        { variableIdentifier: "paymentSatoshis", roleIdentifier: "payer", value: PAYMENT_SATOSHIS },
        { variableIdentifier: "boundLockingScript", roleIdentifier: "payer", value: p2pkhLockingHex(boundAddress) },
        { variableIdentifier: "boundBindingId", roleIdentifier: "payer", value: binding.statement.bindingId },
      ],
      inputs: [{
        outpointTransactionHash: outpointBytes(change.outpointTransactionHash),
        outpointIndex: change.outpointIndex,
      }],
    });
    const payTxid = await executeInvitation(engine, pay.invitation.invitationIdentifier, ["paymentOutput"], {
      valueSatoshis: BigInt(change.valueSatoshis) - PAYMENT_SATOSHIS - RELAY_FEE_SATOSHIS,
      lockingBytecode: payerLock,
    });
    console.log(`pay ${payTxid}`);

    const result: ChipnetResult = {
      network: "chipnet",
      fundingAddress,
      faucetTxid,
      boundAddress,
      binding,
      claims: [
        { name: "commitBinding", txid: commitTxid, explorer: `${EXPLORER}/${commitTxid}?network=chipnet` },
        { name: "payBoundIdentity", txid: payTxid, explorer: `${EXPLORER}/${payTxid}?network=chipnet` },
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
