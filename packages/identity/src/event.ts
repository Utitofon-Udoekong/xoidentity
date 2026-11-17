import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import {
  BINDING_D_TAG,
  BINDING_KIND,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
} from "./constants.ts";
import type { BindingStatement, NostrEvent, UnsignedNostrEvent } from "./types.ts";
import { buildBchSigningMessage, identityTagValue } from "./statement.ts";

export function createUnsignedBindingEvent(
  statement: BindingStatement,
  bchSignature: string,
  createdAt?: number
): UnsignedNostrEvent {
  const tags: string[][] = [
    ["d", BINDING_D_TAG],
    ["i", identityTagValue(statement.bchAddress), bchSignature],
    ["bch", statement.bchAddress, statement.bchNetwork],
    ["binding", statement.bindingId],
    ["network", statement.bchNetwork],
    ["protocol", PROTOCOL_ID, PROTOCOL_VERSION],
  ];
  if (statement.expiresAt !== undefined) {
    tags.push(["expiration", String(statement.expiresAt)]);
  }
  return {
    kind: BINDING_KIND,
    created_at: createdAt ?? statement.createdAt,
    tags,
    content: buildBchSigningMessage(statement),
  };
}

export function signBindingEvent(
  unsigned: UnsignedNostrEvent,
  nostrPrivateKey: Uint8Array
): NostrEvent {
  if (nostrPrivateKey.length !== 32) {
    throw new Error("Nostr private key must be 32 bytes");
  }
  const event = finalizeEvent(
    {
      kind: unsigned.kind,
      created_at: unsigned.created_at,
      tags: unsigned.tags,
      content: unsigned.content,
    },
    nostrPrivateKey
  );
  return event as NostrEvent;
}

export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    // Copy only NIP-01 fields so nostr-tools does not return a cached result
    // from finalizeEvent after the event was mutated.
    return verifyEvent({
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content,
      sig: event.sig,
    });
  } catch {
    return false;
  }
}

export function findTag(event: NostrEvent, name: string): string[] | undefined {
  return event.tags.find((t) => t[0] === name);
}

export function requireTag(event: NostrEvent, name: string): string[] {
  const tag = findTag(event, name);
  if (!tag) throw new Error(`Missing ${name} tag`);
  return tag;
}
