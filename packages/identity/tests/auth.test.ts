import { describe, expect, it } from "vitest";
import {
  InMemoryReplayStore,
  createChallenge,
  signAuthResponse,
  verifyAuthResponse,
} from "../src/index.ts";
import { makeSignedBinding, randomBchPrivateKey } from "./helpers.ts";
import { generateNostrPrivateKey } from "../src/binding.ts";

describe("challenge-response authentication", () => {
  it("authenticates a fresh Nostr (and BCH) signature of the challenge", async () => {
    const { binding, bchPrivateKey, nostrPrivateKey } = makeSignedBinding();
    const store = new InMemoryReplayStore();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      action: "login",
      bindingId: binding.statement.bindingId,
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(challenge, nostrPrivateKey, bchPrivateKey);
    const result = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: store,
      expectedAudience: "https://merchant.example",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("authenticated");
  });

  it("rejects a replayed challenge", async () => {
    const { binding, nostrPrivateKey } = makeSignedBinding();
    const store = new InMemoryReplayStore();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(challenge, nostrPrivateKey);
    const first = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: store,
    });
    expect(first.ok).toBe(true);
    const second = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: store,
    });
    expect(second.ok).toBe(false);
    expect(second.status).toBe("replay_detected");
  });

  it("rejects an expired challenge", async () => {
    const { binding, nostrPrivateKey } = makeSignedBinding();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      ttlSeconds: 30,
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(challenge, nostrPrivateKey);
    const result = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt + 31,
      replayStore: new InMemoryReplayStore(),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("expired_challenge");
  });

  it("rejects an audience mismatch", async () => {
    const { binding, nostrPrivateKey } = makeSignedBinding();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(challenge, nostrPrivateKey);
    const result = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: new InMemoryReplayStore(),
      expectedAudience: "https://other.example",
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("audience_mismatch");
  });

  it("rejects a challenge signed by the wrong Nostr key", async () => {
    const { binding } = makeSignedBinding();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(challenge, generateNostrPrivateKey());
    const result = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: new InMemoryReplayStore(),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("signature_invalid");
  });

  it("rejects a BCH challenge signature from the wrong address", async () => {
    const { binding, nostrPrivateKey } = makeSignedBinding();
    const challenge = createChallenge({
      audience: "https://merchant.example",
      now: binding.statement.createdAt,
    });
    const response = signAuthResponse(
      challenge,
      nostrPrivateKey,
      randomBchPrivateKey()
    );
    const result = await verifyAuthResponse(challenge, response, binding, {
      now: binding.statement.createdAt,
      replayStore: new InMemoryReplayStore(),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("signature_invalid");
  });

  it("issues unique challenge ids and nonces", () => {
    const a = createChallenge({ audience: "a" });
    const b = createChallenge({ audience: "a" });
    expect(a.challengeId).not.toBe(b.challengeId);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.expiresAt).toBeGreaterThan(a.issuedAt);
  });
});
