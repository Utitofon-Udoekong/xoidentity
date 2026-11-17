import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import {
  AUTH_DOMAIN,
  AUTH_KIND,
  DEFAULT_CHALLENGE_TTL_SECONDS,
  MAX_CHALLENGE_TTL_SECONDS,
} from "./constants.ts";
import { bytesToHex, randomBytes } from "./bytes.ts";
import { canonicalize } from "./canonicalize.ts";
import { signBchMessage, verifyBchMessage } from "./bch-message.ts";
import { verify } from "./verify.ts";
import type {
  AuthChallenge,
  AuthResponse,
  AuthResult,
  CreateChallengeParams,
  IdentityBinding,
  NostrEvent,
  ReplayStore,
  UnsignedNostrEvent,
  VerifyAuthOptions,
} from "./types.ts";

export class InMemoryReplayStore implements ReplayStore {
  private readonly seen = new Map<string, number>();

  consume(id: string, expiresAt: number): boolean {
    this.prune(Math.floor(Date.now() / 1000));
    if (this.seen.has(id)) return false;
    this.seen.set(id, expiresAt);
    return true;
  }

  clear(): void {
    this.seen.clear();
  }

  private prune(now: number): void {
    for (const [id, exp] of this.seen) {
      if (exp <= now) this.seen.delete(id);
    }
  }
}

const defaultReplayStore = new InMemoryReplayStore();

export function getDefaultReplayStore(): InMemoryReplayStore {
  return defaultReplayStore;
}

export function createChallenge(params: CreateChallengeParams): AuthChallenge {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? DEFAULT_CHALLENGE_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error("ttlSeconds must be a positive integer");
  }
  if (ttl > MAX_CHALLENGE_TTL_SECONDS) {
    throw new Error(`ttlSeconds must be <= ${MAX_CHALLENGE_TTL_SECONDS}`);
  }
  if (!params.audience || params.audience.trim() === "") {
    throw new Error("audience is required");
  }

  const challenge: AuthChallenge = {
    challengeId: bytesToHex(randomBytes(16)),
    nonce: bytesToHex(randomBytes(32)),
    audience: params.audience,
    action: params.action ?? "authenticate",
    issuedAt: now,
    expiresAt: now + ttl,
  };
  if (params.bindingId) challenge.bindingId = params.bindingId;
  return challenge;
}

export function buildAuthSigningMessage(challenge: AuthChallenge): string {
  const body: Record<string, unknown> = {
    action: challenge.action,
    audience: challenge.audience,
    challengeId: challenge.challengeId,
    expiresAt: challenge.expiresAt,
    issuedAt: challenge.issuedAt,
    nonce: challenge.nonce,
  };
  if (challenge.bindingId) body.bindingId = challenge.bindingId;
  return `${AUTH_DOMAIN}\n${canonicalize(body)}`;
}

export function createUnsignedAuthEvent(
  challenge: AuthChallenge,
  nostrPubkey: string
): UnsignedNostrEvent {
  const content = buildAuthSigningMessage(challenge);
  const tags: string[][] = [
    ["challenge", challenge.challengeId],
    ["nonce", challenge.nonce],
    ["audience", challenge.audience],
    ["action", challenge.action],
  ];
  if (challenge.bindingId) tags.push(["binding", challenge.bindingId]);
  return {
    kind: AUTH_KIND,
    created_at: challenge.issuedAt,
    tags,
    content,
    pubkey: nostrPubkey,
  };
}

export function signAuthResponse(
  challenge: AuthChallenge,
  nostrPrivateKey: Uint8Array,
  bchPrivateKey?: Uint8Array
): AuthResponse {
  const unsigned = createUnsignedAuthEvent(challenge, "");
  const event = finalizeEvent(
    {
      kind: unsigned.kind,
      created_at: unsigned.created_at,
      tags: unsigned.tags,
      content: unsigned.content,
    },
    nostrPrivateKey
  ) as NostrEvent;

  const response: AuthResponse = {
    challengeId: challenge.challengeId,
    event,
  };
  if (bchPrivateKey) {
    response.bchSignature = signBchMessage(
      buildAuthSigningMessage(challenge),
      bchPrivateKey
    );
  }
  return response;
}

export async function verifyAuthResponse(
  challenge: AuthChallenge,
  response: AuthResponse,
  binding: IdentityBinding,
  options: VerifyAuthOptions = {}
): Promise<AuthResult> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const store = options.replayStore ?? defaultReplayStore;
  const details: string[] = [];

  if (response.challengeId !== challenge.challengeId) {
    return {
      ok: false,
      status: "challenge_mismatch",
      details: ["Response challengeId does not match issued challenge"],
    };
  }

  if (now > challenge.expiresAt) {
    return {
      ok: false,
      status: "expired_challenge",
      details: ["Challenge has expired"],
    };
  }
  if (challenge.issuedAt > now + 5) {
    return {
      ok: false,
      status: "malformed",
      details: ["Challenge issuedAt is in the future"],
    };
  }

  const expectedAudience = options.expectedAudience ?? challenge.audience;
  if (challenge.audience !== expectedAudience) {
    return {
      ok: false,
      status: "audience_mismatch",
      details: ["Challenge audience does not match verifier"],
    };
  }

  const bindingResult = verify(binding, { now });
  if (!bindingResult.ok || !bindingResult.binding) {
    return {
      ok: false,
      status: "binding_invalid",
      details: ["Underlying binding failed verification", ...bindingResult.details],
    };
  }

  if (challenge.bindingId && challenge.bindingId !== binding.statement.bindingId) {
    return {
      ok: false,
      status: "binding_mismatch",
      details: ["Challenge is scoped to a different bindingId"],
    };
  }

  const expectedContent = buildAuthSigningMessage(challenge);
  if (response.event.content !== expectedContent) {
    return {
      ok: false,
      status: "nonce_mismatch",
      details: ["Auth event content is not the canonical challenge payload"],
    };
  }

  if (response.event.kind !== AUTH_KIND) {
    return {
      ok: false,
      status: "malformed",
      details: [`Expected auth kind ${AUTH_KIND}`],
    };
  }

  if (!verifyEvent(response.event)) {
    return {
      ok: false,
      status: "signature_invalid",
      details: ["Nostr auth event signature is invalid"],
    };
  }
  if (response.event.pubkey.toLowerCase() !== binding.statement.nostrPubkey) {
    return {
      ok: false,
      status: "signature_invalid",
      details: ["Auth event was not signed by the bound Nostr key"],
    };
  }
  details.push("Nostr challenge signature valid");

  if (response.bchSignature) {
    const bch = verifyBchMessage(
      expectedContent,
      binding.statement.bchAddress,
      response.bchSignature
    );
    if (!bch.valid) {
      return {
        ok: false,
        status: "signature_invalid",
        details: [
          ...details,
          bch.error ?? "BCH challenge signature does not match bound address",
        ],
      };
    }
    details.push("BCH challenge signature valid");
  }

  const replayKey = `${challenge.challengeId}:${challenge.nonce}`;
  const consumed = await store.consume(replayKey, challenge.expiresAt);
  if (!consumed) {
    return {
      ok: false,
      status: "replay_detected",
      details: ["This challenge or nonce has already been used"],
    };
  }

  details.push("Challenge not expired, not replayed");
  details.push(`Authenticated for audience: ${challenge.audience}`);

  return {
    ok: true,
    status: "authenticated",
    details,
    binding,
  };
}
