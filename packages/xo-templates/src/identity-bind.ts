import type { XOTemplate } from "@xo-cash/types";

const SCHEMA = "https://libauth.org/schemas/wallet-template-v0.schema.json";

/**
 * Commits a bchblaze-id binding id on chipnet or mainnet.
 * The id is the commitment of an immutable CashToken NFT locked to the holder.
 * Genesis requires the spent outpoint to be index 0, so `consolidate` moves a
 * coin there before `commitBinding` mints it.
 */
export const identityBindTemplate: XOTemplate = {
  $schema: SCHEMA,
  name: "Identity bind",
  description: "Publish the id of a Bitcoin Cash and Nostr binding.",
  icon: "bind",
  version: "1",
  supported: ["BCH_2023_05", "BCH_2024_05", "BCH_2025_05", "BCH_2026_05"],
  defaults: {
    change: { output: "changeOutput", role: "holder", generate: ["holderKey"] },
    address: { lockingScript: "holdingLockingScript", role: "holder", generate: ["holderKey"] },
    receive: { output: "receiveOutput", role: "holder", generate: ["holderKey"] },
  },
  roles: {
    holder: {
      name: "Holder",
      description: "The person publishing their Bitcoin Cash and Nostr binding.",
      icon: "holder",
    },
  },
  start: [
    { action: "consolidate", role: "holder", secrets: [{ holderKey: null }] },
    { action: "commitBinding", role: "holder", generate: ["holderKey"] },
  ],
  actions: {
    consolidate: {
      name: "Prepare coin",
      description: "Move funds to output 0 so the binding can be minted.",
      icon: "receive",
      roles: {
        holder: {
          name: "Prepare coin",
          description: "Move funds to output 0 so the binding can be minted.",
          icon: "receive",
          requirements: { secrets: ["holderKey"] },
        },
      },
      requirements: {
        participants: [{ role: "holder", slots: { min: 1, max: 1 } }],
      },
      transaction: "consolidateTransaction",
    },
    commitBinding: {
      name: "Commit identity",
      description: "Publish the binding id for your Bitcoin Cash address and Nostr key.",
      icon: "bind",
      roles: {
        holder: {
          name: "Commit identity",
          description: "Publish the binding id for your Bitcoin Cash address and Nostr key.",
          icon: "bind",
          requirements: {
            secrets: ["holderKey"],
            variables: ["nostrPubkey", "bindingId", "genesisCategory"],
          },
        },
      },
      requirements: {
        participants: [{ role: "holder", slots: { min: 1, max: 1 } }],
      },
      transaction: "commitBindingTransaction",
    },
  },
  transactions: {
    consolidateTransaction: {
      name: "Coin prepared",
      description: "Moved funds to a single output.",
      icon: "receive",
      inputs: [],
      outputs: [],
      version: 2,
      locktime: 0,
      composable: true,
    },
    commitBindingTransaction: {
      name: "Identity committed",
      description: "Published a binding id.",
      icon: "bind",
      inputs: [],
      outputs: [{ output: "bindingMarkOutput", outputIndex: 0 }],
      version: 2,
      locktime: 0,
      composable: true,
    },
  },
  inputs: {},
  outputs: {
    bindingMarkOutput: {
      name: "Binding id",
      description: "An immutable token whose commitment is the binding id.",
      icon: "bind",
      lockingScript: "holdingLockingScript",
      valueSatoshis: "2000",
      token: {
        category: "$(<genesisCategory>)",
        amount: null,
        nft: {
          capability: "none",
          commitment: "$(<bindingId>)",
        },
      },
    },
    changeOutput: {
      name: "Change",
      description: "Funds returned as change.",
      icon: "receive",
      lockingScript: "holdingLockingScript",
    },
    receiveOutput: {
      name: "Received funds",
      description: "Funds received by the holder.",
      icon: "receive",
      lockingScript: "holdingLockingScript",
    },
  },
  lockingScripts: {
    holdingLockingScript: {
      name: "Holder address",
      description: "Funds the holder can spend.",
      icon: "address",
      lockingType: "p2pkh",
      lockingBytecode: "lockHolding",
      unlockingBytecode: "unlockHolding",
      roles: {
        holder: {
          state: { variables: [], secrets: ["holderKey"] },
          actions: [
            { action: "consolidate", role: "holder", secrets: [{ holderKey: null }] },
            { action: "commitBinding", role: "holder", secrets: [{ holderKey: null }] },
          ],
          balance: { satoshis: true },
          selectable: true,
        },
      },
    },
  },
  scripts: {
    lockHolding: "OP_DUP OP_HASH160 <$(<holderKey.public_key> OP_HASH160)> OP_EQUALVERIFY OP_CHECKSIG",
    unlockHolding: "<holderKey.schnorr_signature.all_outputs> <holderKey.public_key>",
  },
  variables: {
    holderKey: {
      name: "Holder key",
      description: "The key that spends the holder's address.",
      type: "private_key",
    },
    nostrPubkey: {
      name: "Nostr key",
      description: "The 32-byte Nostr public key in the binding.",
      type: "bytes",
    },
    bindingId: {
      name: "Binding id",
      description: "The 32-byte id of the Bitcoin Cash and Nostr binding.",
      type: "token_commitment",
    },
    genesisCategory: {
      name: "Genesis category",
      description: "The transaction id of the output 0 coin this binding is minted from.",
      type: "token_category",
    },
  },
  icons: [
    { name: "bind", hash: "0000000000000000000000" },
    { name: "holder", hash: "0000000000000000000000" },
    { name: "address", hash: "0000000000000000000000" },
    { name: "receive", hash: "0000000000000000000000" },
  ],
};
