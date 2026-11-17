/** Canonical statement both keys commit to. */
export type BchNetwork = "mainnet" | "chipnet" | "testnet";

export type CashAddressTypeName =
  | "p2pkh"
  | "p2sh"
  | "p2pkh-tokens"
  | "p2sh-tokens";

export interface BindingStatement {
  protocol: "bchblaze-id";
  version: "1.0.0";
  bindingId: string;
  bchAddress: string;
  bchNetwork: BchNetwork;
  nostrPubkey: string;
  createdAt: number;
  expiresAt?: number;
  purpose: "identity-binding";
  nonce: string;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface UnsignedNostrEvent {
  pubkey?: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

/** Portable, exportable binding record. */
export interface IdentityBinding {
  protocol: "bchblaze-id";
  version: "1.0.0";
  statement: BindingStatement;
  bchSignature: string;
  event: NostrEvent;
}

export interface CreateStatementParams {
  bchAddress: string;
  bchNetwork: BchNetwork;
  nostrPubkey: string;
  createdAt?: number;
  expiresAt?: number;
  nonce?: string;
}

export interface BindingDraft {
  statement: BindingStatement;
  bchMessage: string;
}

export type VerificationStatus =
  | "verified"
  | "malformed"
  | "unsupported_format"
  | "invalid_binding_id"
  | "tampered"
  | "expired"
  | "timestamp_invalid"
  | "bch_signature_invalid"
  | "nostr_signature_invalid"
  | "key_mismatch"
  | "network_mismatch"
  | "incomplete_proof";

export interface VerificationResult {
  ok: boolean;
  status: VerificationStatus;
  details: string[];
  verifiedAt: number;
  binding?: IdentityBinding;
  bchValid: boolean;
  nostrValid: boolean;
}

export interface VerifyOptions {
  /** Unix seconds. Injected by tests; defaults to now. */
  now?: number;
  maxClockSkewSeconds?: number;
}

export interface AuthChallenge {
  challengeId: string;
  nonce: string;
  audience: string;
  action: string;
  issuedAt: number;
  expiresAt: number;
  bindingId?: string;
}

export interface AuthResponse {
  challengeId: string;
  event: NostrEvent;
  bchSignature?: string;
}

export type AuthStatus =
  | "authenticated"
  | "malformed"
  | "challenge_mismatch"
  | "expired_challenge"
  | "replay_detected"
  | "audience_mismatch"
  | "nonce_mismatch"
  | "binding_mismatch"
  | "signature_invalid"
  | "binding_invalid";

export interface AuthResult {
  ok: boolean;
  status: AuthStatus;
  details: string[];
  binding?: IdentityBinding;
}

export interface ReplayStore {
  /** Returns false if `id` was already consumed. */
  consume(id: string, expiresAt: number): boolean | Promise<boolean>;
}

export interface DiscoverOptions {
  relays?: string[];
  timeoutMs?: number;
}

export interface PublishResult {
  relay: string;
  ok: boolean;
  error?: string;
}

export interface CashTokenCommitment {
  /** 32-byte SHA-256 commitment. Fits in a CashTokens NFT commitment (≤40 bytes). */
  bytes: Uint8Array;
  hex: string;
  domain: string;
  bindingId: string;
  nostrEventId: string;
}

export interface DecodedCashAddress {
  prefix: string;
  type: CashAddressTypeName;
  hash: Uint8Array;
  network: BchNetwork | "regtest";
}

export interface CreateChallengeParams {
  audience: string;
  action?: string;
  bindingId?: string;
  ttlSeconds?: number;
  now?: number;
}

export interface VerifyAuthOptions {
  now?: number;
  replayStore?: ReplayStore;
  expectedAudience?: string;
}
