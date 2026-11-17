import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { PROTOCOL_ID, PROTOCOL_VERSION } from "./constants.ts";
import { canonicalize } from "./canonicalize.ts";
import { encodeCashAddress, prefixForNetwork } from "./cashaddr.ts";
import { hash160, pubkeyFromPrivateKey, signBchMessage } from "./bch-message.ts";
import {
  assertBindingStatement,
  createBindingDraft,
  createStatement,
} from "./statement.ts";
import { createUnsignedBindingEvent, signBindingEvent } from "./event.ts";
import type {
  BindingStatement,
  BchNetwork,
  CashAddressTypeName,
  CreateStatementParams,
  IdentityBinding,
  NostrEvent,
} from "./types.ts";

export { createBindingDraft, createStatement };

export function assembleIdentityBinding(
  statement: BindingStatement,
  bchSignature: string,
  event: NostrEvent
): IdentityBinding {
  return {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    statement: assertBindingStatement(statement),
    bchSignature,
    event,
  };
}

export function exportIdentityBinding(binding: IdentityBinding): string {
  return canonicalize(binding);
}

export function importIdentityBinding(json: string): IdentityBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("IdentityBinding JSON is not valid JSON");
  }
  return assertIdentityBinding(parsed);
}

export function assertIdentityBinding(value: unknown): IdentityBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("IdentityBinding is not an object");
  }
  const rec = value as Record<string, unknown>;
  if (rec.protocol !== PROTOCOL_ID) throw new Error("Wrong protocol");
  if (rec.version !== PROTOCOL_VERSION) throw new Error("Unsupported version");
  if (typeof rec.bchSignature !== "string" || rec.bchSignature.length < 60) {
    throw new Error("Missing BCH signature");
  }
  const statement = assertBindingStatement(rec.statement);
  const event = rec.event;
  if (!event || typeof event !== "object") throw new Error("Missing event");
  const ev = event as Record<string, unknown>;
  if (typeof ev.id !== "string" || typeof ev.pubkey !== "string") {
    throw new Error("Malformed Nostr event");
  }
  if (typeof ev.created_at !== "number" || typeof ev.kind !== "number") {
    throw new Error("Malformed Nostr event");
  }
  if (!Array.isArray(ev.tags) || typeof ev.content !== "string" || typeof ev.sig !== "string") {
    throw new Error("Malformed Nostr event");
  }
  return {
    protocol: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    statement,
    bchSignature: rec.bchSignature,
    event: {
      id: ev.id,
      pubkey: ev.pubkey,
      created_at: ev.created_at,
      kind: ev.kind,
      tags: ev.tags as string[][],
      content: ev.content,
      sig: ev.sig,
    },
  };
}

export function bindingFromEvent(
  event: NostrEvent,
  bchSignature?: string
): IdentityBinding {
  const iTag = event.tags.find((t) => t[0] === "i");
  const sig = bchSignature ?? iTag?.[2];
  if (!sig) throw new Error("BCH signature missing from i-tag");

  const nl = event.content.indexOf("\n");
  if (nl === -1) throw new Error("Event content is not a domain-separated statement");
  const body = event.content.slice(nl + 1);
  const statement = assertBindingStatement(JSON.parse(body));
  return assembleIdentityBinding(statement, sig, event);
}

export interface SignBindingKeys {
  bchPrivateKey: Uint8Array;
  nostrPrivateKey: Uint8Array;
}

/**
 * Sign a binding with in-memory keys. Keys are used once and never stored.
 * Production wallets should sign `draft.bchMessage` in Electron Cash / Paytaca
 * and the unsigned event via NIP-07 instead of passing private keys.
 */
export function signBinding(
  params: CreateStatementParams,
  keys: SignBindingKeys
): IdentityBinding {
  const draft = createBindingDraft(params);
  const bchSignature = signBchMessage(draft.bchMessage, keys.bchPrivateKey);
  const unsigned = createUnsignedBindingEvent(draft.statement, bchSignature);
  const event = signBindingEvent(unsigned, keys.nostrPrivateKey);
  return assembleIdentityBinding(draft.statement, bchSignature, event);
}

export function cashAddressFromPrivateKey(
  privateKey: Uint8Array,
  network: BchNetwork,
  type: CashAddressTypeName = "p2pkh"
): string {
  const pub = pubkeyFromPrivateKey(privateKey, true);
  const hash = hash160(pub);
  return encodeCashAddress(prefixForNetwork(network), type, hash);
}

export function nostrPubkeyFromPrivateKey(privateKey: Uint8Array): string {
  return getPublicKey(privateKey);
}

export function generateNostrPrivateKey(): Uint8Array {
  return generateSecretKey();
}
