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
pnpm --filter @bchblaze/xoidentity broadcast
```

`broadcast` uses a mainnet wallet under `apps/xoidentity/.xo/` (gitignored). When that wallet has no spendable coin of at least 8,000 satoshis, it prints a `bitcoincash:` receive address and waits. Send 20,000 satoshis to that address from your own wallet. It then broadcasts the commit and the payment, and writes `apps/xoidentity/public/mainnet-result.json`.

The live demo is https://xoidentity.vercel.app/. The page shows those mainnet transactions after the result file is published. A pasted [Nostrobridge](https://nostrobridge.vercel.app/) kind 30734 event is checked with `verify()` and the cashaddr it names is the address `payBoundIdentity` pays.
