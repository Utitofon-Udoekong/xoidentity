# bchblaze-id v1.0.0

Cryptographic binding of a Bitcoin Cash P2PKH address to a Nostr public key. A third party can implement this document without reading any code.

A valid binding proves that, at signing time, one party controlled both keys and both signatures cover the same canonical statement. It does **not** prove legal identity, reputation, or ongoing control. Fresh control requires the authentication flow in §7.

Private keys never appear in the protocol. Wallets sign; verifiers check.

## 0. Choice of statement and event kind

Two existing drafts were reviewed:

Sources checked 2026-11-17: [penny spec](https://bch-nostr-id.surge.sh/spec/) (CC0), [Identity Bridge protocol](https://github.com/alberdioni8406/BCH-Identity-Bridge/blob/main/docs/protocol-spec.md) plus `src/lib/identity/canonicalize.ts` and `binding.ts`, and [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) / [NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md) on master.

| | penny (`bch-nostr-id`) | Identity Bridge |
|---|---|---|
| Statement the BCH key signs | `bch-nostr-bind.v1:<64-hex pubkey>:<cashaddr>:<unix ts>` | `bch-identity-bridge/bch-proof/v1.0.0\n` + a **flat** canonical JSON object (`bindingId`, `bchAddress`, `bchNetwork`, `nostrPubkey`, `nonce`, `purpose`, `createdAt`). `expiresAt` is not in this string. |
| Canonicalization | Fixed colon order. No JSON. The cashaddr itself contains a colon (`bitcoincash:…`), so a split on `:` is ambiguous. | `JSON.stringify` of recursively sorted keys, no whitespace, `undefined` dropped. Binding id hashes a **nested** object (`bch`, `nostr`, plus `expiresAt` when set). Nostr `content` is a **third** object (nested `bch`, no nostr pubkey, no `expiresAt`). |
| Event | kind **30078**, `content` = that same statement | kind **31234**, `content` = the third JSON, not the BCH message |
| Tags | `d=bch-nostr-bind`, NIP-39 `i=bch:<cashaddr>` plus the base64 BCH signature, `statement` | `d=<bindingId>`, `bch`, `protocol`, `nonce`. **No BCH signature in the event.** |
| Replace | Stable `d`, so the newest event replaces the old address | `d` is the binding id, so a new nonce does not replace the old event |
| Auth | Demo signs a one-time challenge with NIP-07 (optional BCH). The public spec does not define that string. | Spec asks for a fresh signature over nonce, audience, action, expiry. The binding event still does not carry the BCH proof. |

Weaknesses that matter for this bounty:

- penny kind 30078 is no longer a public interchange format. NIP-78 says relays SHOULD require NIP-42 AUTH and serve 30078 only to the author. A payer is not the author, so a compliant relay hides the binding.
- penny has no binding id, no nonce, and no expiry. The colon statement collides with `bitcoincash:`.
- Identity Bridge signs three different serializations. A third party who only fetches the kind 31234 event cannot check the BCH signature, because it lives in a sidecar JSON the relay never sees.
- Kind 31234 is NIP-37: NIP-44-encrypted drafts. Clients and private-storage relays treat that kind as author-only. It is the wrong kind for a public proof.
- A kind 0 `i` tag, in penny, is explicitly not a proof. Neither format should accept it.

**Chosen hybrid**

1. One canonical statement (Identity Bridge’s sorted JSON + SHA-256 binding id), and both keys sign that exact string. Event `content` is the BCH message. There is not a second JSON.
2. The BCH signature rides in a NIP-39 `i` tag (penny), so the relay event alone is the proof. `verify(event)` needs no sidecar and no trust in this app.
3. Kind **30734**, addressable, not assigned in the NIP kind index. Not 30078. Not 31234.
4. `d` is the stable string `bchblaze-id/v1`, so a new binding replaces the previous one for that author (penny’s replacement rule).
5. Authentication responses are kind 22243 and **sign** the challenge (nonce, audience, action, expiry). A seen-set rejects replay. The login signature is not the binding.

## 1. Constants

| Name | Value |
|---|---|
| Protocol id | `bchblaze-id` |
| Version | `1.0.0` |
| Purpose | `identity-binding` |
| Binding kind | `30734` (addressable, 30000–39999; not NIP-78, not NIP-37) |
| Auth kind | `22243` (ephemeral, 20000–29999; next to NIP-42 `22242`) |
| `d` tag | `bchblaze-id/v1` |
| BCH proof domain | `bchblaze-id/bch-proof/v1` |
| Auth domain | `bchblaze-id/auth/v1` |
| CashTokens domain | `bchblaze-id/cashtoken-commitment/v1` |
| Default auth TTL | 120 seconds (max 600) |
| Clock skew | 120 seconds |

Networks: `mainnet` (`bitcoincash:`), `chipnet` and `testnet` (both `bchtest:`).

## 2. Canonicalization

`canonicalize(value)` is JSON with:

- object keys sorted lexicographically at every level
- no whitespace
- `undefined` omitted
- only finite numbers
- UTF-8

Example: `{"b":1,"a":2}` → `{"a":2,"b":1}`.

## 3. Binding statement

```json
{
  "bchAddress": "bitcoincash:q...",
  "bchNetwork": "mainnet",
  "bindingId": "<32-byte hex>",
  "createdAt": 1731790000,
  "expiresAt": 1763326000,
  "nonce": "<32-byte hex>",
  "nostrPubkey": "<32-byte hex>",
  "protocol": "bchblaze-id",
  "purpose": "identity-binding",
  "version": "1.0.0"
}
```

`expiresAt` is optional. When present it must be an integer strictly greater than `createdAt`.

### 3.1 Normalization (before hashing)

- `nostrPubkey`: 64-char lowercase hex, no `0x`.
- `bchAddress`: canonical cashaddr, lowercase, with prefix. P2PKH (`q…`) or token-aware P2PKH (`z…`) only. P2SH is rejected.
- Prefix must match `bchNetwork`.

### 3.2 Binding ID

`bindingId = SHA-256(UTF-8(canonicalize(fields without bindingId)))`.

Hashed fields: `protocol`, `version`, `bchAddress`, `bchNetwork`, `nostrPubkey`, `createdAt`, `expiresAt` (omit if absent), `purpose`, `nonce`.

A verifier **must** recompute this hash. Mismatch means tampering.

### 3.3 BCH signing message

Exact UTF-8 string:

```
bchblaze-id/bch-proof/v1
<canonicalize(full statement including bindingId)>
```

There is a single newline after the domain line. The JSON line has no trailing newline. This is the string a BCH wallet (Electron Cash: Tools → Sign/verify message) signs.

## 4. BCH proof

Standard Bitcoin Cash signed message, identical to Bitcoin Core / Electron Cash:

1. `prefix = 0x18 || "Bitcoin Signed Message:\n"`
2. `payload = prefix || compactSize(utf8ByteLength(message)) || utf8(message)`
3. `digest = SHA-256(SHA-256(payload))`
4. secp256k1 recoverable signature of `digest`
5. 65-byte compact encoding: `header || r || s`, then Base64.
   - `header = 27 + recId + (4 if compressed pubkey)`
6. Recover the pubkey, `HASH160 = RIPEMD160(SHA-256(pubkey))`, compare to the cashaddr payload.

A 64-byte signature (raw `r||s`) **may** be accepted by trying recovery ids 0–3 with a compressed pubkey, for wallets that omit the header. New implementations **must** produce 65-byte signatures.

## 5. Nostr proof

One addressable event:

| Field | Value |
|---|---|
| `kind` | `30734` |
| `pubkey` | the bound Nostr key (hex) |
| `created_at` | unix seconds; must not precede `statement.createdAt` by more than clock skew |
| `content` | the exact BCH signing message from §3.3 |
| `tags` | see below |
| `id`, `sig` | NIP-01 (SHA-256 of serialized event, BIP-340) |

Tags, in this order when creating (order is signed; verifiers look up by name):

```
["d", "bchblaze-id/v1"]
["i", "bch:<cashaddr>", "<base64 BCH signature>"]
["bch", "<cashaddr>", "<network>"]
["binding", "<bindingId>"]
["network", "<network>"]
["protocol", "bchblaze-id", "1.0.0"]
["expiration", "<expiresAt>"]   // only if expiresAt is set (NIP-40)
```

The `i` tag follows NIP-39: identity `bch:<cashaddr>` (cashaddr includes the `bitcoincash:` / `bchtest:` prefix) and proof = BCH signature.

Because kind 30734 is addressable and `d` is stable, publishing a new event replaces the previous binding for that author on relays. Kind 30078 and kind 31234 events are rejected.

## 6. Offline verification (`verify`)

Input: the Nostr event, or a portable `IdentityBinding` JSON record (below). No network.

Reject unless **all** hold:

1. Event `id` and BIP-340 `sig` verify for `pubkey` (NIP-01).
2. `kind === 30734`. Kind 30078 and kind 31234 fail here.
3. `content` starts with `bchblaze-id/bch-proof/v1\n` and the remainder is canonical JSON of a statement.
4. Recomputed `bindingId` matches.
5. `event.pubkey === statement.nostrPubkey`.
6. `d`, `i`, `bch`, `binding`, `protocol` tags match the statement and the BCH signature.
7. `createdAt` / `event.created_at` are not in the future beyond clock skew; `event.created_at` is not before `createdAt` beyond skew.
8. If `expiresAt` is set, it is strictly after now.
9. BCH signature verifies for `statement.bchAddress` over the exact `content`.

Any tag swap, JSON key reorder, address change, or key mismatch fails.

### 6.1 Portable record

```json
{
  "protocol": "bchblaze-id",
  "version": "1.0.0",
  "statement": { "...BindingStatement..." },
  "bchSignature": "<base64>",
  "event": { "...NIP-01 event..." }
}
```

`bchSignature` must equal the `i` tag proof. Export with `canonicalize`.

## 7. Challenge-response authentication

Proves **current** control of the bound Nostr key (optionally also the BCH key).

Verifier issues:

```json
{
  "action": "authenticate",
  "audience": "https://example.com",
  "challengeId": "<16-byte hex>",
  "expiresAt": 1731790120,
  "issuedAt": 1731790000,
  "nonce": "<32-byte hex>",
  "bindingId": "<optional>"
}
```

TTL default 120 s, maximum 600 s. `audience` is the verifier origin or application id.

Signing message:

```
bchblaze-id/auth/v1
<canonicalize(challenge fields, bindingId omitted if absent)>
```

The user produces an ephemeral Nostr event:

- `kind`: `22243`
- `content`: the signing message
- `tags`: `["challenge", challengeId]`, `["nonce", nonce]`, `["audience", audience]`, `["action", action]`, optional `["binding", bindingId]`
- signed by the bound Nostr key

Optional: a BCH `signmessage` of the same signing message by the bound address.

Verifier checks, in order:

1. `challengeId` matches; `audience` matches the issuing verifier.
2. `now <= expiresAt`; `issuedAt` not in the future.
3. The published (or supplied) binding still `verify()`s.
4. If the challenge named a `bindingId`, it matches.
5. Event content is the canonical signing message; kind is 22243; BIP-340 sig valid; pubkey is the bound key.
6. If a BCH signature is present, it verifies against the bound cashaddr.
7. Consume `(challengeId, nonce)` in a seen-set. If already consumed → `replay_detected`. Consume **only after** the signatures succeed, so a failed attempt can be retried.

Do not publish auth events. Relays may drop kind 22243. `verifyAuthResponse` is offline given the challenge, the response, and the binding.

## 8. Discovery

Relays are untrusted. Every fetched event is passed through `verify()`.

Filters:

```
# by Nostr author
{ "kinds": [30734], "authors": ["<pubkey hex>"], "#d": ["bchblaze-id/v1"] }

# by BCH address
{ "kinds": [30734], "#i": ["bch:<canonical cashaddr>"], "#d": ["bchblaze-id/v1"] }

# by binding id
{ "kinds": [30734], "#binding": ["<bindingId>"], "#d": ["bchblaze-id/v1"] }
```

Take the newest event that verifies. Suggested relays: `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://relay.nostr.band`. Callers should prefer the user's NIP-65 list.

## 9. CashTokens commitment (optional)

After `verify()` succeeds:

```
commitment = SHA-256(UTF-8(
  "bchblaze-id/cashtoken-commitment/v1\n" +
  canonicalize({
    bchAddress, bchSignature, bindingId, nostrEventId, nostrPubkey
  })
))
```

32 bytes, hex-encoded 64 chars. Fits in a CashTokens NFT commitment (max 40 bytes). Pinning `nostrEventId` and `bchSignature` means a later rebind does not match the NFT.

## 10. Creation (wallet flow)

1. Collect cashaddr + Nostr pubkey (NIP-07 `getPublicKey`). No private keys leave the wallet.
2. Build the statement (§3) and the BCH signing message (§3.3).
3. User signs the message in Electron Cash / Paytaca; paste the Base64 signature.
4. Build the unsigned kind-30734 event (§5); sign with NIP-07 `signEvent`.
5. Run `verify()` locally. Only then publish to relays.
6. Optionally genesis a CashTokens NFT with §9 as commitment.

## 11. Security notes

- Relays can withhold, delay, or serve stale events. They cannot forge a binding.
- Domain separation prevents using a binding signature as a login somewhere else, and vice versa.
- A published binding is not a session. Authenticate with §7.
- Linking a reused BCH address to an npub is a privacy tradeoff. Token-aware `z` addresses are allowed so wallets can receive CashTokens; they still reuse the same key.
- P2SH addresses cannot produce this signed-message proof.

## 12. Test vectors

Canonicalization: `canonicalize({b:1,a:2})` = `{"a":2,"b":1}`.

Cashaddr (spec): type 0, hash `F5BF48B397DAE70BE82B3CCA4793F8EB2B6CDAC9` → `bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2`.

Bitcoin/Electron Cash signed message (same digest as Bitcoin Core):

- message: `Chancellor on brink of second bailout for banks`
- signature: `H/9jMOnj4MFbH3d7t4yCQ9i7DgZU/VZ278w3+ySv2F4yIsdqjsc5ng3kmN8OZAThgyfCZOQxZCWza9V5XzlVY0Y=`
- cashaddr: `bitcoincash:qqehccy89v7ftlfgr9v0zvhjzyy7eatdkqt05lt3nw`
