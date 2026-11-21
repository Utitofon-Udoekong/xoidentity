# XOIdentity protocol

XO templates describe a Bitcoin Cash action. The engine builds the transaction. This note is the shape used by `@bchblaze/xo-templates` and the invitation steps a second implementation can follow without this app.

The engine build these templates are written against is `@xo-cash/engine@0.1.0-next.17612568780`, with `@xo-cash/types@0.0.8` and `@xo-cash/utils@0.0.10`. `parseTemplate` in `@xo-cash/utils` is the Zod check. `$schema` is still `https://libauth.org/schemas/wallet-template-v0.schema.json`. The XO project has not published a mature JSON Schema of its own. `engine.importTemplate` is the check that matters.

## Template shape

Both templates declare `supported` VM versions `BCH_2023_05` through `BCH_2026_05`, a `version` of `1`, and defaults for `change`, `address`, and `receive`. Those defaults are standard P2PKH (`OP_DUP OP_HASH160 <hash160(pubkey)> OP_EQUALVERIFY OP_CHECKSIG`) so a wallet can fund the template and get change back. The unlocking script is a Schnorr signature over all outputs plus the public key.

`IdentityBind` has one role, `holder`. Its start action is `commitBinding`. The holder supplies:

| Variable | Type | Meaning |
| --- | --- | --- |
| `holderKey` | `private_key` | Key the engine generates and uses for this template's own P2PKH outputs |
| `nostrPubkey` | `bytes` | 32-byte Nostr public key, from a bchblaze-id statement |
| `bindingId` | `token_commitment` | 32-byte id from `computeBindingId` in `@bchblaze/identity` |
| `genesisCategory` | `token_category` | Transaction id of the output-0 coin the NFT is minted from |

`commitBinding` mints an immutable CashToken whose commitment is `bindingId`, locked to the holder's P2PKH, with 2,000 satoshis. CashToken genesis is valid only when the transaction spends output 0 of the parent, so `consolidate` first moves the funded coin to a single P2PKH output. The engine drops outputs whose value is zero when it encodes a transaction, so the binding is not an `OP_RETURN`.

`PayToBoundIdentity` has one role, `payer`. Its start action is `payBoundIdentity`. The payer supplies `paymentSatoshis`, `boundLockingScript` (the full P2PKH locking bytecode of the cashaddr inside a verified bchblaze-id statement), and `boundBindingId`. The payment output uses that locking script as raw bytecode (`p2s`, no extra P2PKH wrap). `boundBindingId` is recorded on the invitation; the on-chain payment is the satoshis sent to the statement address.

Names and descriptions are written for a person using a wallet: "Commit identity", "Pay bound identity". The script fragments are the part an auditor reads.

## Invitation

One `Engine` is one mnemonic on one network. This project uses mainnet.

```text
Engine.create
  importTemplate(identityBind) and importTemplate(payToBoundIdentity)
  setDefaultPolicies to the identity template
  generateLockingBytecodeFromDefaultPolicy('receive')
  wait until listSpendableUnspentOutputs shows the funded coins
  consolidate when the coin is not output 0, then commitBinding, then payBoundIdentity

createInvitation({ template, action, intent from template.start, variables, inputs })
listMissingRequirements
  appendInvitation with the template output identifiers
  addChangeToInvitation
  listOwnInputIndexes, then signInvitation for each
executeAction({ broadcastTransaction: true })
```

A commit only adds. The role on the first commit comes from the start intent. Variables that belong to a role carry that `roleIdentifier`. Inputs are reserved until broadcast. Change is added before any signature, because the signature covers the outputs.

`serializeInvitation` / `deserializeInvitation` are how a second wallet would join. These two actions have a single required role, so one funded account can finish them alone. A later copy of an invitation is applied with `updateInvitation`, not `acceptInvitation`.

## What a mainnet broadcast proves

The binding record itself is the bchblaze-id object: one canonical statement, a BCH message signature, and a kind 30734 Nostr signature. `verify()` checks both. The XO transaction does not replace that proof. It publishes the binding id and, for the payment, moves satoshis to the statement's P2PKH.

A third party checks:

1. `verify(binding)` is ok.
2. The commit transaction mints an immutable NFT whose commitment equals `binding.statement.bindingId`, and the token category is the transaction id of the output-0 coin it spends.
3. The payment transaction pays `paymentSatoshis` to `OP_DUP OP_HASH160 <hash160 of statement.bchAddress> OP_EQUALVERIFY OP_CHECKSIG`.

The app writes the txid and the mainnet explorer URL after `executeAction` returns. A txid is only published after the engine reports a broadcast.

## Migration from Nostro

[Nostrobridge](https://nostrobridge.vercel.app/) collects a cashaddr with WizardConnect or Paytaca, a NIP-07 signature, and publishes a kind 30734 event. That event stays the binding. The XO payment replaces the manual "paste an address and send" step: `verify()` yields `statement.bchAddress`, the app turns that into `boundLockingScript`, and `payBoundIdentity` builds the transaction. The wallet's keys stay inside the engine account instead of a page-level Paytaca call.
