import { describe, expect, it } from "vitest";
import {
  bitcoinMessageHash,
  cashAddressFromPrivateKey,
  signBchMessage,
  verifyBchMessage,
} from "../src/index.ts";
import { bytesToHex } from "../src/bytes.ts";
import { randomBchPrivateKey } from "./helpers.ts";

describe("BCH signed message", () => {
  it("matches the Electron Cash / Bitcoin Core magic hash of 'test'", () => {
    expect(bytesToHex(bitcoinMessageHash("test"))).toBe(
      "9ce428d58e8e4caf619dc6fc7b2c2c28f0561654d1f80f322c038ad5e67ff8a6"
    );
  });

  it("verifies the Chancellor vector against the known cashaddr", () => {
    const message = "Chancellor on brink of second bailout for banks";
    const signature =
      "H/9jMOnj4MFbH3d7t4yCQ9i7DgZU/VZ278w3+ySv2F4yIsdqjsc5ng3kmN8OZAThgyfCZOQxZCWza9V5XzlVY0Y=";
    const address = "bitcoincash:qqehccy89v7ftlfgr9v0zvhjzyy7eatdkqt05lt3nw";
    const result = verifyBchMessage(message, address, signature);
    expect(result.valid).toBe(true);
  });

  it("round-trips sign and verify for a random P2PKH cashaddr", () => {
    const key = randomBchPrivateKey();
    const address = cashAddressFromPrivateKey(key, "mainnet");
    const message = "bchblaze-id/bch-proof/v1\n{\"hello\":1}";
    const signature = signBchMessage(message, key);
    expect(verifyBchMessage(message, address, signature).valid).toBe(true);
    expect(verifyBchMessage(message + "x", address, signature).valid).toBe(false);
  });

  it("rejects a signature for a different address", () => {
    const keyA = randomBchPrivateKey();
    const keyB = randomBchPrivateKey();
    const addrB = cashAddressFromPrivateKey(keyB, "mainnet");
    const signature = signBchMessage("hello", keyA);
    expect(verifyBchMessage("hello", addrB, signature).valid).toBe(false);
  });
});
