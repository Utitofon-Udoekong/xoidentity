import { sha256 } from "@noble/hashes/sha256.js";
import {
  BCH_PROOF_DOMAIN,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  PURPOSE_IDENTITY_BINDING,
} from "./constants.ts";
import { bytesToHex, isHex, randomBytes } from "./bytes.ts";
import { canonicalize } from "./canonicalize.ts";
import {
  decodeCashAddress,
  isP2pkhType,
  networkCompatible,
  normalizeCashAddress,
} from "./cashaddr.ts";
import type {
  BindingDraft,
  BindingStatement,
  CreateStatementParams,
} from "./types.ts";

const BINDING_ID_FIELDS = [
  "protocol",
  "version",
  "bchAddress",
  "bchNetwork",
  "nostrPubkey",
  "createdAt",
  "expiresAt",
  "purpose",
  "nonce",
] as const;

export function normalizeNostrPubkey(pubkey: string): string {
  const hex = pubkey.trim().toLowerCase().replace(/^0x/, "");
  if (!isHex(hex, 32)) {
    throw new Error("Nostr pubkey must be 32-byte lowercase hex (64 chars)");
  }
  return hex;
}

export function computeBindingId(
  fields: Omit<BindingStatement, "bindingId">
): string {
  const payload: Record<string, unknown> = {
    protocol: fields.protocol,
    version: fields.version,
    bchAddress: fields.bchAddress,
    bchNetwork: fields.bchNetwork,
    nostrPubkey: fields.nostrPubkey,
    createdAt: fields.createdAt,
    purpose: fields.purpose,
    nonce: fields.nonce,
  };
  if (fields.expiresAt !== undefined) {
    payload.expiresAt = fields.expiresAt;
  }
  return bytesToHex(sha256(new TextEncoder().encode(canonicalize(payload))));
}

export function buildBchSigningMessage(statement: BindingStatement): string {
  return `${BCH_PROOF_DOMAIN}\n${canonicalize(statement)}`;
}

export function parseBchSigningMessage(message: string): BindingStatement {
  const nl = message.indexOf("\n");
  if (nl === -1) {
    throw new Error("Binding message missing domain separator");
  }
  const domain = message.slice(0, nl);
  const body = message.slice(nl + 1);
  if (domain !== BCH_PROOF_DOMAIN) {
    throw new Error(`Unexpected proof domain: ${domain}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Binding message body is not JSON");
  }
  if (canonicalize(parsed) !== body) {
    throw new Error("Binding message JSON is not canonical");
  }
  return assertBindingStatement(parsed);
}

export function assertBindingStatement(value: unknown): BindingStatement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Statement is not an object");
  }
  const s = value as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (!BINDING_ID_FIELDS.includes(key as (typeof BINDING_ID_FIELDS)[number]) && key !== "bindingId") {
      throw new Error(`Unknown statement field: ${key}`);
    }
  }
  if (s.protocol !== PROTOCOL_ID) throw new Error("Wrong protocol");
  if (s.version !== PROTOCOL_VERSION) throw new Error("Unsupported version");
  if (s.purpose !== PURPOSE_IDENTITY_BINDING) throw new Error("Unsupported purpose");
  if (typeof s.bindingId !== "string" || !isHex(s.bindingId, 32)) {
    throw new Error("Invalid bindingId");
  }
  if (typeof s.bchAddress !== "string") throw new Error("Missing bchAddress");
  if (s.bchNetwork !== "mainnet" && s.bchNetwork !== "chipnet" && s.bchNetwork !== "testnet") {
    throw new Error("Invalid bchNetwork");
  }
  if (typeof s.nostrPubkey !== "string") throw new Error("Missing nostrPubkey");
  if (typeof s.createdAt !== "number" || !Number.isInteger(s.createdAt) || s.createdAt < 0) {
    throw new Error("Invalid createdAt");
  }
  if (s.expiresAt !== undefined) {
    if (typeof s.expiresAt !== "number" || !Number.isInteger(s.expiresAt) || s.expiresAt <= s.createdAt) {
      throw new Error("Invalid expiresAt");
    }
  }
  if (typeof s.nonce !== "string" || !isHex(s.nonce, 32)) {
    throw new Error("Invalid nonce");
  }

  const nostrPubkey = normalizeNostrPubkey(s.nostrPubkey);
  const bchAddress = normalizeCashAddress(s.bchAddress, s.bchNetwork);
  const decoded = decodeCashAddress(bchAddress);
  if (!isP2pkhType(decoded.type)) {
    throw new Error("Binding address must be P2PKH (q) or token-aware P2PKH (z)");
  }
  if (!networkCompatible(decoded.network, s.bchNetwork)) {
    throw new Error("Address prefix does not match bchNetwork");
  }

  const statement: BindingStatement = {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    bindingId: s.bindingId,
    bchAddress,
    bchNetwork: s.bchNetwork,
    nostrPubkey,
    createdAt: s.createdAt,
    purpose: PURPOSE_IDENTITY_BINDING,
    nonce: s.nonce,
  };
  if (s.expiresAt !== undefined) statement.expiresAt = s.expiresAt;

  const expectedId = computeBindingId({
    protocol: statement.protocol,
    version: statement.version,
    bchAddress: statement.bchAddress,
    bchNetwork: statement.bchNetwork,
    nostrPubkey: statement.nostrPubkey,
    createdAt: statement.createdAt,
    expiresAt: statement.expiresAt,
    purpose: statement.purpose,
    nonce: statement.nonce,
  });
  if (expectedId !== statement.bindingId) {
    throw new Error("bindingId does not match SHA-256 of canonical fields");
  }
  if (bchAddress !== s.bchAddress) {
    throw new Error("bchAddress is not canonical cashaddr");
  }
  if (nostrPubkey !== s.nostrPubkey) {
    throw new Error("nostrPubkey is not canonical lowercase hex");
  }
  return statement;
}

export function createStatement(params: CreateStatementParams): BindingStatement {
  const createdAt = params.createdAt ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(createdAt) || createdAt < 0) {
    throw new Error("createdAt must be a unix-second integer");
  }
  const nonce = params.nonce ?? bytesToHex(randomBytes(32));
  if (!isHex(nonce, 32)) throw new Error("nonce must be 32-byte hex");

  const nostrPubkey = normalizeNostrPubkey(params.nostrPubkey);
  const bchAddress = normalizeCashAddress(params.bchAddress, params.bchNetwork);

  const partial: Omit<BindingStatement, "bindingId"> = {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    bchAddress,
    bchNetwork: params.bchNetwork,
    nostrPubkey,
    createdAt,
    purpose: PURPOSE_IDENTITY_BINDING,
    nonce,
  };
  if (params.expiresAt !== undefined) {
    if (!Number.isInteger(params.expiresAt) || params.expiresAt <= createdAt) {
      throw new Error("expiresAt must be an integer after createdAt");
    }
    partial.expiresAt = params.expiresAt;
  }

  return {
    ...partial,
    bindingId: computeBindingId(partial),
  };
}

export function createBindingDraft(params: CreateStatementParams): BindingDraft {
  const statement = createStatement(params);
  return {
    statement,
    bchMessage: buildBchSigningMessage(statement),
  };
}

export function identityTagValue(cashaddr: string): string {
  return `bch:${cashaddr}`;
}

export function parseIdentityTagValue(value: string): string {
  if (!value.startsWith("bch:")) {
    throw new Error("i-tag identity must start with bch:");
  }
  return value.slice("bch:".length);
}
