import { describe, expect, it } from "vitest";
import { prepareCashTokenCommitment } from "../src/index.ts";
import { makeSignedBinding } from "./helpers.ts";

describe("CashTokens commitment", () => {
  it("produces a deterministic 32-byte commitment of a verified binding", () => {
    const { binding } = makeSignedBinding();
    const a = prepareCashTokenCommitment(binding);
    const b = prepareCashTokenCommitment(binding);
    expect(a.bytes.length).toBe(32);
    expect(a.hex).toBe(b.hex);
    expect(a.hex).toHaveLength(64);
    expect(a.bindingId).toBe(binding.statement.bindingId);
    expect(a.nostrEventId).toBe(binding.event.id);
    expect(a.domain).toBe("bchblaze-id/cashtoken-commitment/v1");
  });

  it("changes if the event id changes (pins this exact proof)", () => {
    const first = makeSignedBinding();
    const second = makeSignedBinding();
    const a = prepareCashTokenCommitment(first.binding);
    const b = prepareCashTokenCommitment(second.binding);
    expect(a.hex).not.toBe(b.hex);
  });
});
