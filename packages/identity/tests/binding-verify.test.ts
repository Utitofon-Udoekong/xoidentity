import { describe, expect, it } from "vitest";
import {
  BINDING_KIND,
  buildBchSigningMessage,
  cashAddressFromPrivateKey,
  createBindingDraft,
  createUnsignedBindingEvent,
  exportIdentityBinding,
  importIdentityBinding,
  nostrPubkeyFromPrivateKey,
  signBinding,
  signBindingEvent,
  signBchMessage,
  verify,
} from "../src/index.ts";
import { generateNostrPrivateKey } from "../src/binding.ts";
import { makeSignedBinding, randomBchPrivateKey } from "./helpers.ts";

describe("verify() happy path", () => {
  it("accepts a dual-signed binding from the event alone and from the portable record", () => {
    const { binding } = makeSignedBinding();
    const fromRecord = verify(binding);
    expect(fromRecord.ok).toBe(true);
    expect(fromRecord.status).toBe("verified");
    expect(fromRecord.bchValid).toBe(true);
    expect(fromRecord.nostrValid).toBe(true);

    const fromEvent = verify(binding.event);
    expect(fromEvent.ok).toBe(true);
    expect(fromEvent.binding?.statement.bindingId).toBe(binding.statement.bindingId);

    const json = exportIdentityBinding(binding);
    const restored = importIdentityBinding(json);
    expect(verify(restored).ok).toBe(true);
    expect(verify(json).ok).toBe(true);
  });

  it("round-trips export/import without changing the bindingId", () => {
    const { binding } = makeSignedBinding();
    const restored = importIdentityBinding(exportIdentityBinding(binding));
    expect(restored.statement.bindingId).toBe(binding.statement.bindingId);
    expect(restored.event.id).toBe(binding.event.id);
  });
});

describe("verify() tampering", () => {
  it("rejects a mutated bindingId", () => {
    const { binding } = makeSignedBinding();
    const tampered = structuredClone(binding);
    tampered.statement.bindingId = "aa".repeat(32);
    const result = verify(tampered);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("malformed");
  });

  it("rejects a swapped cashaddr in the statement", () => {
    const { binding } = makeSignedBinding();
    const other = cashAddressFromPrivateKey(randomBchPrivateKey(), "mainnet");
    const tampered = structuredClone(binding);
    tampered.statement.bchAddress = other;
    const result = verify(tampered);
    expect(result.ok).toBe(false);
  });

  it("rejects event content that is not canonical", () => {
    const { binding } = makeSignedBinding();
    const tampered = structuredClone(binding);
    tampered.event.content = tampered.event.content.replace("{", " {");
    const result = verify(tampered.event);
    expect(result.ok).toBe(false);
    expect(["tampered", "malformed", "nostr_signature_invalid"]).toContain(
      result.status
    );
  });

  it("rejects an i-tag address that does not match the statement", () => {
    const { binding } = makeSignedBinding();
    const other = cashAddressFromPrivateKey(randomBchPrivateKey(), "mainnet");
    const tamperedEvent = structuredClone(binding.event);
    const i = tamperedEvent.tags.find((t) => t[0] === "i");
    if (!i) throw new Error("missing i tag");
    i[1] = `bch:${other}`;
    const result = verify(tamperedEvent);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("nostr_signature_invalid");
  });
});

describe("verify() signature mismatch", () => {
  it("rejects a BCH signature from a different key", () => {
    const { binding, nostrPrivateKey } = makeSignedBinding();
    const otherKey = randomBchPrivateKey();
    const wrongSig = signBchMessage(
      buildBchSigningMessage(binding.statement),
      otherKey
    );
    const unsigned = createUnsignedBindingEvent(binding.statement, wrongSig);
    const event = signBindingEvent(unsigned, nostrPrivateKey);
    const result = verify(event);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("bch_signature_invalid");
  });

  it("rejects a Nostr event signed by a different key", () => {
    const bchKey = randomBchPrivateKey();
    const nostrA = generateNostrPrivateKey();
    const nostrB = generateNostrPrivateKey();
    const binding = signBinding(
      {
        bchAddress: cashAddressFromPrivateKey(bchKey, "mainnet"),
        bchNetwork: "mainnet",
        nostrPubkey: nostrPubkeyFromPrivateKey(nostrA),
      },
      { bchPrivateKey: bchKey, nostrPrivateKey: nostrA }
    );
    const unsigned = createUnsignedBindingEvent(
      binding.statement,
      binding.bchSignature
    );
    const wrongEvent = signBindingEvent(unsigned, nostrB);
    const result = verify(wrongEvent);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("key_mismatch");
  });
});

describe("verify() expiry and timestamps", () => {
  it("rejects an expired binding", () => {
    const now = Math.floor(Date.now() / 1000);
    const { binding } = makeSignedBinding({
      createdAt: now - 100,
      expiresAt: now - 1,
    });
    const result = verify(binding, { now });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("expired");
  });

  it("rejects createdAt too far in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const { binding } = makeSignedBinding({ createdAt: now + 10_000 });
    const result = verify(binding, { now });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("timestamp_invalid");
  });
});

describe("drafts never include private keys", () => {
  it("createBindingDraft only returns public statement fields", () => {
    const draft = createBindingDraft({
      bchAddress: "bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2",
      bchNetwork: "mainnet",
      nostrPubkey: "cc".repeat(32),
      createdAt: 1_700_000_000,
      nonce: "dd".repeat(32),
    });
    const blob = JSON.stringify(draft);
    expect(blob).not.toMatch(/private/i);
    expect(blob).not.toMatch(/nsec/);
    expect(draft.bchMessage.startsWith("bchblaze-id/bch-proof/v1\n")).toBe(true);
    expect(draft.statement.protocol).toBe("bchblaze-id");
  });

  it("uses dedicated kind 30734, not NIP-78 30078 or NIP-37 31234", () => {
    const { binding } = makeSignedBinding();
    expect(binding.event.kind).toBe(BINDING_KIND);
    expect(BINDING_KIND).toBe(30734);
    expect(binding.event.kind).not.toBe(30078);
    expect(binding.event.kind).not.toBe(31234);

    const as30078 = structuredClone(binding.event);
    as30078.kind = 30078;
    expect(verify(as30078).status).toBe("unsupported_format");

    const asDraft = structuredClone(binding.event);
    asDraft.kind = 31234;
    expect(verify(asDraft).status).toBe("unsupported_format");
  });
});
