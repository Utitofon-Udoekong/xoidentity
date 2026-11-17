import { describe, expect, it } from "vitest";
import { canonicalize, computeBindingId, createStatement } from "../src/index.ts";

describe("canonicalize", () => {
  it("sorts keys recursively and emits no whitespace", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { b: 1, a: 2 }, a: [3, { y: 1, x: 2 }] })).toBe(
      '{"a":[3,{"x":2,"y":1}],"z":{"a":2,"b":1}}'
    );
  });

  it("omits undefined and rejects non-finite numbers", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalize({ x: Infinity })).toThrow(/Non-finite/);
    expect(() => canonicalize({ x: Number.NaN })).toThrow(/Non-finite/);
  });
});

describe("bindingId", () => {
  it("is SHA-256 of canonical fields and is stable under key reorder", async () => {
    const statement = createStatement({
      bchAddress: "bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2",
      bchNetwork: "mainnet",
      nostrPubkey: "aa".repeat(32),
      createdAt: 1_700_000_000,
      nonce: "bb".repeat(32),
    });
    const recomputed = computeBindingId({
      protocol: statement.protocol,
      version: statement.version,
      bchAddress: statement.bchAddress,
      bchNetwork: statement.bchNetwork,
      nostrPubkey: statement.nostrPubkey,
      createdAt: statement.createdAt,
      purpose: statement.purpose,
      nonce: statement.nonce,
    });
    expect(statement.bindingId).toBe(recomputed);
    expect(statement.bindingId).toHaveLength(64);
  });
});
