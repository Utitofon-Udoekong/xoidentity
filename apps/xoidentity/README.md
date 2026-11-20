# XOIdentity desk

The build description is the [repository README](../../README.md). This note is the broadcast the desk displays.

Two XO templates and a chipnet invitation runner.

`IdentityBind` mints an immutable CashToken whose commitment is a 32-byte bchblaze-id binding id. `PayToBoundIdentity` pays 2,000 satoshis to the P2PKH named by that binding. The protocol note is `packages/xo-templates/protocol.md`.

## What a judge runs

From the repo root:

```text
pnpm install
pnpm --filter @bchblaze/identity build
pnpm --filter @bchblaze/xo-templates validate
pnpm --filter @bchblaze/xoidentity broadcast
```

`broadcast` creates a throwaway chipnet mnemonic in `apps/xoidentity/.xo/` (gitignored), imports the templates into `@xo-cash/engine`, requests coins from https://chipnet.bch.ninja when the account has no spendable coin of at least 8,000 satoshis, and broadcasts the invitations. It writes `apps/xoidentity/public/chipnet-result.json` with the txids and Selene explorer links.

The run already recorded on chipnet:

- Consolidate the faucet coin to output 0: https://chipnet.imaginary.cash/tx/e0af5b1514479bdca1bf2189c7a7fca7f21bf7e6174f699b8d27071762630648
- Commit the binding: https://explorer.selene.cash/tx/41753d81623d718675136efcd436d3911c341c2ad67a0e670cfdc55405731a88?network=chipnet
- Pay the bound address: https://explorer.selene.cash/tx/3dc88494f383fc5f019ad377b81704f30c38686f43f2fff6a620020bc223baf4?network=chipnet

The commit transaction's NFT commitment is `2dd771d0d8e47c1c489d503131beb151b6cb55d0be0e8f77a4776b341322ee95`, the same id as `binding.statement.bindingId` in `chipnet-result.json`. The payment's first output is `bchtest:qzuq8ald23rt0vsyufgrcv0h0gf8sq74qcq9j5hy2g`, the address inside that binding. The same transactions are also on https://chipnet.imaginary.cash.

Then:

```text
pnpm --filter @bchblaze/xoidentity dev
```

The live demo is https://xoidentity.vercel.app/. The page shows the txids. A pasted [Nostrobridge](https://nostrobridge.vercel.app/) kind 30734 event is checked with `verify()` and the cashaddr it names is the address `payBoundIdentity` pays.

Set `XO_MNEMONIC` to reuse an account that already has chipnet coins. The script skips the faucet when the account already has a spendable output of at least 8,000 satoshis.
