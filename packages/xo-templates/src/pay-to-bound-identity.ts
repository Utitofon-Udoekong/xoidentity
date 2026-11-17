import type { XOTemplate } from "@xo-cash/types";

const SCHEMA = "https://libauth.org/schemas/wallet-template-v0.schema.json";

/**
 * Pays satoshis to the P2PKH named by a verified bchblaze-id statement.
 * The payment output is that locking script, unchanged.
 */
export const payToBoundIdentityTemplate: XOTemplate = {
  $schema: SCHEMA,
  name: "Pay bound identity",
  description: "Pay the Bitcoin Cash address named by a verified Nostr binding.",
  icon: "pay",
  version: "1",
  supported: ["BCH_2023_05", "BCH_2024_05", "BCH_2025_05", "BCH_2026_05"],
  defaults: {
    change: { output: "changeOutput", role: "payer", generate: ["payerKey"] },
    address: { lockingScript: "payerLockingScript", role: "payer", generate: ["payerKey"] },
    receive: { output: "receiveOutput", role: "payer", generate: ["payerKey"] },
  },
  roles: {
    payer: {
      name: "Payer",
      description: "The person paying a bound Bitcoin Cash address.",
      icon: "payer",
    },
  },
  start: [
    { action: "payBoundIdentity", role: "payer", generate: ["payerKey"] },
  ],
  actions: {
    payBoundIdentity: {
      name: "Pay bound identity",
      description: "Send Bitcoin Cash to the address in a verified binding.",
      icon: "pay",
      roles: {
        payer: {
          name: "Pay bound identity",
          description: "Send Bitcoin Cash to the address in a verified binding.",
          icon: "pay",
          requirements: {
            secrets: ["payerKey"],
            variables: ["paymentSatoshis", "boundLockingScript", "boundBindingId"],
          },
        },
      },
      requirements: {
        participants: [{ role: "payer", slots: { min: 1, max: 1 } }],
      },
      transaction: "payBoundIdentityTransaction",
    },
  },
  transactions: {
    payBoundIdentityTransaction: {
      name: "Paid a bound identity",
      description: "Sent Bitcoin Cash to a bound address.",
      icon: "pay",
      inputs: [],
      outputs: [
        { output: "paymentOutput", outputIndex: 0 },
      ],
      version: 2,
      locktime: 0,
      composable: true,
    },
  },
  inputs: {},
  outputs: {
    paymentOutput: {
      name: "Payment",
      description: "Bitcoin Cash paid to the bound address.",
      icon: "pay",
      lockingScript: "boundRecipientScript",
      valueSatoshis: "$(<paymentSatoshis>)",
    },
    changeOutput: {
      name: "Change",
      description: "Funds returned as change.",
      icon: "receive",
      lockingScript: "payerLockingScript",
    },
    receiveOutput: {
      name: "Received funds",
      description: "Funds received by the payer.",
      icon: "receive",
      lockingScript: "payerLockingScript",
    },
  },
  lockingScripts: {
    boundRecipientScript: {
      name: "Bound address",
      description: "The address named by the binding.",
      icon: "address",
      lockingType: "p2s",
      lockingBytecode: "lockToBound",
      unlockingBytecode: "unlockBoundRecipient",
      selectable: false,
      roles: {
        payer: { relevant: false, selectable: false, balance: {} },
      },
    },
    payerLockingScript: {
      name: "Payer address",
      description: "Funds the payer can spend.",
      icon: "address",
      lockingType: "p2pkh",
      lockingBytecode: "lockPayer",
      unlockingBytecode: "unlockPayer",
      roles: {
        payer: {
          state: { variables: [], secrets: ["payerKey"] },
          actions: [
            { action: "payBoundIdentity", role: "payer", secrets: [{ payerKey: null }] },
          ],
          balance: { satoshis: true },
          selectable: true,
        },
      },
    },
  },
  scripts: {
    lockPayer: "OP_DUP OP_HASH160 <$(<payerKey.public_key> OP_HASH160)> OP_EQUALVERIFY OP_CHECKSIG",
    unlockPayer: "<payerKey.schnorr_signature.all_outputs> <payerKey.public_key>",
    lockToBound: "$(<boundLockingScript>)",
    unlockBoundRecipient: "OP_0",
  },
  variables: {
    payerKey: {
      name: "Payer key",
      description: "The key that spends the payer's address.",
      type: "private_key",
    },
    paymentSatoshis: {
      name: "Amount",
      description: "How many satoshis to send to the bound address.",
      type: "satoshis",
      hint: "satoshis",
    },
    boundLockingScript: {
      name: "Bound address",
      description: "The locking script of the Bitcoin Cash address in the binding.",
      type: "locking_script",
    },
    boundBindingId: {
      name: "Binding id",
      description: "The 32-byte id of the binding being paid.",
      type: "bytes",
    },
  },
  icons: [
    { name: "pay", hash: "0000000000000000000000" },
    { name: "payer", hash: "0000000000000000000000" },
    { name: "address", hash: "0000000000000000000000" },
    { name: "receive", hash: "0000000000000000000000" },
  ],
};
