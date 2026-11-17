/** Protocol identifier. Domain-separates every signed payload. */
export const PROTOCOL_ID = "bchblaze-id";

/** Semver of this statement/event schema. */
export const PROTOCOL_VERSION = "1.0.0";

/**
 * Dedicated addressable kind for the public binding event.
 *
 * Kind 30078 (NIP-78) is rejected: since 2026-09 relays SHOULD require NIP-42 AUTH
 * and serve 30078 only to its author, and NIP-78 says it is not an interchange format.
 * Kind 31234 is rejected: NIP-37 assigns it to NIP-44-encrypted drafts, which
 * private-storage relays may hide from everyone except the author.
 * 30734 is addressable (30000–39999) and is not assigned in the NIP kind index.
 * The stable d-tag `bchblaze-id/v1` makes a new binding replace the previous one.
 */
export const BINDING_KIND = 30734;

/**
 * Ephemeral authentication-response kind (20000–29999). Adjacent to NIP-42
 * AUTH (22242). Relays are not expected to store these; `verify()` works from
 * the signed event object alone.
 */
export const AUTH_KIND = 22243;

/** Stable `d` tag so each author has one current replaceable binding. */
export const BINDING_D_TAG = "bchblaze-id/v1";

export const PURPOSE_IDENTITY_BINDING = "identity-binding";

export const BCH_PROOF_DOMAIN = "bchblaze-id/bch-proof/v1";
export const AUTH_DOMAIN = "bchblaze-id/auth/v1";
export const TOKEN_COMMITMENT_DOMAIN = "bchblaze-id/cashtoken-commitment/v1";

/** Default auth challenge lifetime. */
export const DEFAULT_CHALLENGE_TTL_SECONDS = 120;

/** Hard cap on challenge lifetime to limit stolen-challenge windows. */
export const MAX_CHALLENGE_TTL_SECONDS = 600;

/** Allowed future skew for createdAt / issuedAt (seconds). */
export const MAX_CLOCK_SKEW_SECONDS = 120;

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
] as const;
