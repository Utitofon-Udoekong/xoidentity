import { describe, expect, it } from "vitest";
import { hexToBytes } from "../src/bytes.ts";
import {
  decodeCashAddress,
  encodeCashAddress,
  normalizeCashAddress,
} from "../src/index.ts";

describe("cashaddr", () => {
  it("round-trips the spec 160-bit type-0 vector", () => {
    const hash = hexToBytes("F5BF48B397DAE70BE82B3CCA4793F8EB2B6CDAC9");
    const addr = encodeCashAddress("bitcoincash", "p2pkh", hash);
    expect(addr).toBe("bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2");
    const decoded = decodeCashAddress(addr);
    expect(decoded.type).toBe("p2pkh");
    expect(decoded.network).toBe("mainnet");
    expect(Buffer.from(decoded.hash).toString("hex")).toBe(
      "f5bf48b397dae70be82b3cca4793f8eb2b6cdac9"
    );
  });

  it("encodes token-aware P2PKH as z-addresses", () => {
    const hash = hexToBytes("F5BF48B397DAE70BE82B3CCA4793F8EB2B6CDAC9");
    const addr = encodeCashAddress("bitcoincash", "p2pkh-tokens", hash);
    expect(addr.startsWith("bitcoincash:z")).toBe(true);
    expect(decodeCashAddress(addr).type).toBe("p2pkh-tokens");
  });

  it("rejects mixed case and bad checksums", () => {
    expect(() =>
      decodeCashAddress("bitcoincash:Qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2")
    ).toThrow(/Mixed-case/);
    expect(() =>
      decodeCashAddress("bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg3")
    ).toThrow(/checksum/);
  });

  it("normalizes prefix-less payloads when a network is given", () => {
    const full = "bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2";
    expect(normalizeCashAddress(full.slice("bitcoincash:".length), "mainnet")).toBe(
      full
    );
  });
});
