import {
  BINDING_D_TAG,
  BINDING_KIND,
  MAX_CLOCK_SKEW_SECONDS,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
} from "./constants.ts";
import { verifyBchMessage } from "./bch-message.ts";
import {
  assertIdentityBinding,
  bindingFromEvent,
} from "./binding.ts";
import { findTag, verifyNostrEvent } from "./event.ts";
import {
  buildBchSigningMessage,
  identityTagValue,
  parseBchSigningMessage,
} from "./statement.ts";
import type {
  IdentityBinding,
  NostrEvent,
  VerificationResult,
  VerificationStatus,
  VerifyOptions,
} from "./types.ts";

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function fail(
  status: VerificationStatus,
  details: string[],
  extras?: Partial<VerificationResult>
): VerificationResult {
  return {
    ok: false,
    status,
    details,
    verifiedAt: unixNow(),
    bchValid: extras?.bchValid ?? false,
    nostrValid: extras?.nostrValid ?? false,
    binding: extras?.binding,
  };
}

function isNostrEvent(value: unknown): value is NostrEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.pubkey === "string" &&
    typeof v.sig === "string" &&
    typeof v.kind === "number" &&
    typeof v.content === "string" &&
    Array.isArray(v.tags)
  );
}

function isIdentityBindingShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.statement !== undefined && v.event !== undefined && v.bchSignature !== undefined;
}

/**
 * Fully offline verification. Accepts a NIP-01 binding event, a portable
 * IdentityBinding record, or JSON of either. Never contacts a relay.
 */
export function verify(
  input: NostrEvent | IdentityBinding | string,
  options: VerifyOptions = {}
): VerificationResult {
  const now = options.now ?? unixNow();
  const skew = options.maxClockSkewSeconds ?? MAX_CLOCK_SKEW_SECONDS;
  const details: string[] = [];

  let parsed: unknown = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return fail("malformed", ["Input is not valid JSON"]);
    }
  }

  let binding: IdentityBinding;
  try {
    if (isIdentityBindingShape(parsed)) {
      binding = assertIdentityBinding(parsed);
    } else if (isNostrEvent(parsed)) {
      binding = bindingFromEvent(parsed);
    } else {
      return fail("unsupported_format", ["Input is neither a binding record nor a Nostr event"]);
    }
  } catch (e) {
    return fail("malformed", [e instanceof Error ? e.message : String(e)]);
  }

  const { statement, event, bchSignature } = binding;

  if (event.kind !== BINDING_KIND) {
    return fail(
      "unsupported_format",
      [`Expected kind ${BINDING_KIND}, got ${event.kind}`],
      { binding }
    );
  }

  const nostrValid = verifyNostrEvent(event);
  if (!nostrValid) {
    details.push("Nostr event id or BIP-340 signature is invalid");
    return fail("nostr_signature_invalid", details, { binding, nostrValid: false });
  }
  details.push("Nostr event signature valid");

  if (event.pubkey.toLowerCase() !== statement.nostrPubkey) {
    details.push("Event author does not match statement.nostrPubkey");
    return fail("key_mismatch", details, { binding, nostrValid: true });
  }

  const expectedContent = buildBchSigningMessage(statement);
  if (event.content !== expectedContent) {
    details.push("Event content is not the canonical domain-separated statement");
    return fail("tampered", details, { binding, nostrValid: true });
  }

  try {
    parseBchSigningMessage(event.content);
  } catch (e) {
    details.push(e instanceof Error ? e.message : String(e));
    return fail("tampered", details, { binding, nostrValid: true });
  }

  const dTag = findTag(event, "d");
  if (!dTag || dTag[1] !== BINDING_D_TAG) {
    details.push(`Missing or mismatched d-tag; expected ${BINDING_D_TAG}`);
    return fail("tampered", details, { binding, nostrValid: true });
  }

  const iTag = findTag(event, "i");
  if (!iTag || iTag[1] !== identityTagValue(statement.bchAddress) || iTag[2] !== bchSignature) {
    details.push("i-tag does not match bch:<cashaddr> and BCH signature");
    return fail("tampered", details, { binding, nostrValid: true });
  }

  const bchTag = findTag(event, "bch");
  if (!bchTag || bchTag[1] !== statement.bchAddress || bchTag[2] !== statement.bchNetwork) {
    details.push("bch tag does not match statement address/network");
    return fail("tampered", details, { binding, nostrValid: true });
  }

  const bindingTag = findTag(event, "binding");
  if (!bindingTag || bindingTag[1] !== statement.bindingId) {
    details.push("binding tag does not match bindingId");
    return fail("tampered", details, { binding, nostrValid: true });
  }

  const protocolTag = findTag(event, "protocol");
  if (!protocolTag || protocolTag[1] !== PROTOCOL_ID || protocolTag[2] !== PROTOCOL_VERSION) {
    details.push("protocol tag mismatch");
    return fail("unsupported_format", details, { binding, nostrValid: true });
  }

  if (statement.createdAt > now + skew) {
    details.push("createdAt is in the future");
    return fail("timestamp_invalid", details, { binding, nostrValid: true });
  }
  if (event.created_at > now + skew) {
    details.push("event.created_at is in the future");
    return fail("timestamp_invalid", details, { binding, nostrValid: true });
  }
  if (event.created_at + skew < statement.createdAt) {
    details.push("event.created_at is before statement.createdAt");
    return fail("timestamp_invalid", details, { binding, nostrValid: true });
  }
  if (statement.expiresAt !== undefined && statement.expiresAt <= now) {
    details.push("Binding has expired");
    return fail("expired", details, { binding, nostrValid: true });
  }

  const bchResult = verifyBchMessage(
    expectedContent,
    statement.bchAddress,
    bchSignature
  );
  if (!bchResult.valid) {
    details.push(bchResult.error ?? "BCH signature invalid");
    return fail("bch_signature_invalid", details, {
      binding,
      nostrValid: true,
      bchValid: false,
    });
  }
  details.push("BCH signed-message signature valid");

  return {
    ok: true,
    status: "verified",
    details: [
      ...details,
      "Both proofs valid and bound to the same canonical statement",
    ],
    verifiedAt: now,
    binding,
    bchValid: true,
    nostrValid: true,
  };
}

export function assertVerified(
  input: NostrEvent | IdentityBinding | string,
  options?: VerifyOptions
): IdentityBinding {
  const result = verify(input, options);
  if (!result.ok || !result.binding) {
    throw new Error(`Verification failed (${result.status}): ${result.details.join("; ")}`);
  }
  return result.binding;
}
