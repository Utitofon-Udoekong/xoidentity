# XOIdentity desk

The build description is the [repository README](../../README.md). This note is the mainnet broadcast the desk displays.

Two XO templates and a mainnet invitation runner.

`IdentityBind` mints an immutable CashToken whose commitment is a 32-byte bchblaze-id binding id. `PayToBoundIdentity` pays 2,000 satoshis to the P2PKH named by that binding. The protocol note is `packages/xo-templates/protocol.md`.

## What a judge runs

From the repo root:

```text
pnpm install
pnpm --filter @bchblaze/identity build
pnpm --filter @bchblaze/xo-templates validate
```

The live demo is https://xoidentity.vercel.app/. It reads `public/mainnet-result.json`.

- Commit: https://blockchair.com/bitcoin-cash/transaction/efab4243dc02fd3148e2e41879200ec4c14662293272e441618741a9c9e62e5f
- Payment: https://blockchair.com/bitcoin-cash/transaction/03da003e0e00bdbfcdde2f62d5354ad3f361a5fe8ce1faf4cc5421919169bbd0

The payment's first output is `bitcoincash:qzua7k4ur7z4a7tgsj50rdvdwh530mq3n547d4uhx9`. The binding id is `c3e6c7ec5ab2db1903c2fc20c57b3af02735492dc67ec8d0241105753a03cf43`. A pasted [Nostrobridge](https://nostrobridge.vercel.app/) kind 30734 event is checked with `verify()` and the cashaddr it names is the address `payBoundIdentity` pays.
