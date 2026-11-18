# XOIdentity

![XOIdentity](apps/xoidentity/public/logo.jpg)

Commit a binding, then pay that address. Two XO templates. One writes the binding id into a CashToken. The other pays the Bitcoin Cash address inside the binding.

Repository: https://github.com/Utitofon-Udoekong/xoidentity

## The problem

A Nostrobridge binding is a signed statement. A wallet template cannot trust a website to remember it. XOIdentity puts the binding id on chipnet, then pays the address that statement names, so the commitment and the payment can be read from the chain.

## How it works

`IdentityBind` mints an immutable CashToken. The NFT commitment is the 32-byte binding id from `@bchblaze/identity`. The XO engine drops outputs of zero satoshis, so the binding is not an `OP_RETURN`. Genesis has to spend output 0, so the broadcast first consolidates a faucet coin.

`PayToBoundIdentity` pays 2,000 satoshis to the P2PKH locking script of the cashaddr inside that binding. The binding id is recorded on the invitation. The coins go to the address.

Both templates are checked with `parseTemplate` and `engine.importTemplate`. The protocol note is `packages/xo-templates/protocol.md`. The desk checks a pasted Nostrobridge record with the same offline `verify()`.

This project is chipnet. The broadcast script uses its own throwaway mnemonic under `apps/xoidentity/.xo/`, which is gitignored. Set `XO_MNEMONIC` to reuse an account that already has chipnet coins.

## Key features

- **Commit.** `commitBinding` writes the binding id into a CashToken commitment.
- **Pay.** `payBoundIdentity` pays the cashaddr named by that binding.
- **Already broadcast.** The chipnet transactions below are in `apps/xoidentity/public/chipnet-result.json` and on the desk.
- **Check a binding.** Paste a Nostrobridge record. A valid one names the address the payment template pays.
- **No key in the page.** The desk only displays the recorded result and runs `verify()`.

| Step | Transaction |
| --- | --- |
| Consolidate the faucet coin to output 0 | [`e0af5b15…0648`](https://chipnet.imaginary.cash/tx/e0af5b1514479bdca1bf2189c7a7fca7f21bf7e6174f699b8d27071762630648) |
| Commit the binding | [`41753d81…1a88`](https://explorer.selene.cash/tx/41753d81623d718675136efcd436d3911c341c2ad67a0e670cfdc55405731a88?network=chipnet) |
| Pay the bound address | [`3dc88494…baf4`](https://explorer.selene.cash/tx/3dc88494f383fc5f019ad377b81704f30c38686f43f2fff6a620020bc223baf4?network=chipnet) |

The commitment is `2dd771d0d8e47c1c489d503131beb151b6cb55d0be0e8f77a4776b341322ee95`, the same id as the binding. The payment output is `bchtest:qzuq8ald23rt0vsyufgrcv0h0gf8sq74qcq9j5hy2g`.

## Tech stack

| Piece | What it is |
| --- | --- |
| App | Next.js 15, React 18, TypeScript, Tailwind, port 3002 |
| Templates | `@bchblaze/xo-templates`, wallet-template shape, VM `BCH_2023_05` through `BCH_2026_05` |
| Engine | `@xo-cash/engine` 0.1.0-next.17612568780, `@xo-cash/utils` 0.0.10, `@bitauth/libauth` |
| Identity | `@bchblaze/identity`, offline `verify()` |
| Network | Chipnet. Faucet at chipnet.bch.ninja when the account has no spendable coin of at least 8,000 satoshis |
| Package manager | pnpm 9.15, Node 18+ |

`pnpm broadcast` compiles native dependencies of the XO engine. The recorded transactions above are the run that already succeeded.

## Hackathon requirements

| Requirement | Where it is |
| --- | --- |
| XO templates, not a one-off raw transaction | `IdentityBind` and `PayToBoundIdentity` |
| A binding a contract can hold | CashToken commitment equals the binding id |
| Pay the address inside the binding | First output of the pay transaction |
| Chipnet, with public transactions | The three transactions in the table |
| The same identity proof as Nostrobridge | `verify()` on the pasted record and on `chipnet-result.json` |
| Keys stay out of the app | Throwaway mnemonic is gitignored. The desk does not ask for it |

## Run

```bash
pnpm install
pnpm --filter @bchblaze/identity build
pnpm dev
```

Open http://localhost:3002. The desk loads the chipnet result. To validate the templates without broadcasting:

```bash
pnpm validate
```
