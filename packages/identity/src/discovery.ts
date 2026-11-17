import { SimplePool } from "nostr-tools/pool";
import type { Event, Filter } from "nostr-tools";
import {
  BINDING_D_TAG,
  BINDING_KIND,
  DEFAULT_RELAYS,
} from "./constants.ts";
import { identityTagValue } from "./statement.ts";
import { normalizeCashAddress } from "./cashaddr.ts";
import { verify } from "./verify.ts";
import type {
  DiscoverOptions,
  IdentityBinding,
  NostrEvent,
  PublishResult,
  VerificationResult,
} from "./types.ts";

export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS];
}

export function buildAuthorFilter(pubkey: string): Filter {
  return {
    kinds: [BINDING_KIND],
    authors: [pubkey.toLowerCase()],
    "#d": [BINDING_D_TAG],
    limit: 5,
  };
}

export function buildAddressFilter(cashaddr: string): Filter {
  const normalized = normalizeCashAddress(cashaddr);
  return {
    kinds: [BINDING_KIND],
    "#i": [identityTagValue(normalized)],
    "#d": [BINDING_D_TAG],
    limit: 20,
  };
}

export function buildBindingIdFilter(bindingId: string): Filter {
  return {
    kinds: [BINDING_KIND],
    "#binding": [bindingId],
    "#d": [BINDING_D_TAG],
    limit: 5,
  };
}

function toNostrEvent(event: Event): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
}

async function queryRelays(
  relays: string[],
  filter: Filter,
  timeoutMs: number
): Promise<Event[]> {
  const pool = new SimplePool();
  try {
    return await pool.querySync(relays, filter, { maxWait: timeoutMs });
  } finally {
    pool.close(relays);
  }
}

export async function discoverByAuthor(
  pubkey: string,
  options: DiscoverOptions = {}
): Promise<VerificationResult[]> {
  const relays = options.relays ?? getDefaultRelays();
  const timeoutMs = options.timeoutMs ?? 4000;
  const events = await queryRelays(relays, buildAuthorFilter(pubkey), timeoutMs);
  return selectVerified(events);
}

export async function discoverByAddress(
  cashaddr: string,
  options: DiscoverOptions = {}
): Promise<VerificationResult[]> {
  const relays = options.relays ?? getDefaultRelays();
  const timeoutMs = options.timeoutMs ?? 4000;
  const events = await queryRelays(relays, buildAddressFilter(cashaddr), timeoutMs);
  return selectVerified(events);
}

export async function discoverByBindingId(
  bindingId: string,
  options: DiscoverOptions = {}
): Promise<VerificationResult[]> {
  const relays = options.relays ?? getDefaultRelays();
  const timeoutMs = options.timeoutMs ?? 4000;
  const events = await queryRelays(relays, buildBindingIdFilter(bindingId), timeoutMs);
  return selectVerified(events);
}

function selectVerified(events: Event[]): VerificationResult[] {
  const ranked = [...events].sort((a, b) => b.created_at - a.created_at);
  const results: VerificationResult[] = [];
  for (const event of ranked) {
    results.push(verify(toNostrEvent(event)));
  }
  return results;
}

export function latestVerifiedBinding(
  results: VerificationResult[]
): IdentityBinding | undefined {
  for (const result of results) {
    if (result.ok && result.binding) return result.binding;
  }
  return undefined;
}

export async function publishBinding(
  event: NostrEvent,
  relays: string[] = getDefaultRelays()
): Promise<PublishResult[]> {
  const pool = new SimplePool();
  const results: PublishResult[] = [];
  try {
    const pubs = pool.publish(relays, event as Event);
    const settled = await Promise.allSettled(pubs);
    for (let i = 0; i < relays.length; i++) {
      const relay = relays[i] ?? "";
      const outcome = settled[i];
      if (outcome?.status === "fulfilled") {
        results.push({ relay, ok: true });
      } else {
        const reason = outcome?.status === "rejected" ? outcome.reason : "unknown";
        results.push({
          relay,
          ok: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
  } finally {
    pool.close(relays);
  }
  return results;
}
