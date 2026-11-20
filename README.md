# XOIdentity

![XOIdentity](apps/xoidentity/public/logo.jpg)

Template: https://docs.google.com/presentation/d/1tAXM_mXYZAIU1D6sTPabc3-kmPcuEnWjl8D15JsQtdY/edit?usp=sharing
github: https://github.com/Utitofon-Udoekong/xoidentity
site: https://xoidentity.vercel.app/
cashtokenaddress: bitcoincash:zq5hh46r4kudjpsayg58gu99h03p00nw4csaumqgy0

Commit a binding, then pay that address. Two XO templates. One writes the binding id into a CashToken. The other pays the Bitcoin Cash address inside the binding.

## The problem

A [Nostrobridge](https://nostrobridge.vercel.app/) binding is a signed statement. A wallet template cannot trust a website to remember it. XOIdentity puts the binding id on mainnet, then pays the mainnet address that statement names.

## How it works

`IdentityBind` mints an immutable CashToken. The NFT commitment is the 32-byte binding id from `@bchblaze/identity`. The XO engine drops outputs of zero satoshis, so the binding is not an `OP_RETURN`. Genesis has to spend output 0, so the broadcast first consolidates a faucet coin.

`PayToBoundIdentity` pays 2,000 satoshis to the P2PKH locking script of the mainnet cashaddr inside that binding. The binding id is recorded on the invitation. The coins go to the address.

Both templates are checked with `parseTemplate` and `engine.importTemplate`. The protocol note is `packages/xo-templates/protocol.md`. The desk checks a pasted mainnet [Nostrobridge](https://nostrobridge.vercel.app/) record with the same offline `verify()`. A chipnet or testnet record is rejected.

The desk reads `public/mainnet-result.json`. No mainnet broadcast is published yet. An earlier chipnet run remains in `public/chipnet-result.json` and is not shown.

## Key features

- **Commit.** `commitBinding` writes the binding id into a CashToken commitment.
- **Pay.** `payBoundIdentity` pays the cashaddr named by that binding.
- **Check a binding.** Paste a mainnet [Nostrobridge](https://nostrobridge.vercel.app/) record. A valid one names the address the payment template pays.
- **No key in the page.** The desk displays a published mainnet result and runs `verify()`.

No mainnet transaction is published yet. The desk says so until `public/mainnet-result.json` exists.

## Tech stack

| Piece | What it is |
| --- | --- |
| App | Next.js 15, React 18, TypeScript, Tailwind, port 3002 |
| Templates | `@bchblaze/xo-templates`, wallet-template shape, VM `BCH_2023_05` through `BCH_2026_05` |
| Engine | `@xo-cash/engine` 0.1.0-next.17612568780, `@xo-cash/utils` 0.0.10, `@bitauth/libauth` |
| Identity | `@bchblaze/identity`, offline `verify()` |
| Network | Mainnet. The desk ignores the earlier chipnet result file |
| Package manager | pnpm 9.15, Node 18+ |

`pnpm broadcast` still targets chipnet and is not the mainnet path. A mainnet result has to be written to `public/mainnet-result.json` from a funded wallet.

## Hackathon requirements

| Requirement | Where it is |
| --- | --- |
| XO templates, not a one-off raw transaction | `IdentityBind` and `PayToBoundIdentity` |
| A binding a contract can hold | CashToken commitment equals the binding id |
| Pay the address inside the binding | First output of the pay transaction |
| Mainnet address inside the binding | The desk rejects a chipnet or testnet record |
| The same identity proof as [Nostrobridge](https://nostrobridge.vercel.app/) | `verify()` on the pasted mainnet record |
| Keys stay out of the app | Throwaway mnemonic is gitignored. The desk does not ask for it |
| Top-of-page banner | Presentation, GitHub, and the EMBER2026 address |

## Run

The live demo is https://xoidentity.vercel.app/. The desk is mainnet.

```bash
pnpm install
pnpm --filter @bchblaze/identity build
pnpm dev
```

To validate the templates without broadcasting:

```bash
pnpm validate
```
