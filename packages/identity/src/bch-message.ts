/**
 * Bitcoin Cash signed-message (the format Electron Cash produces).
 *
 * Digest: double-SHA256 of `\x18Bitcoin Signed Message:\n` || compact-size(len)
 * || utf8(message). Signature is 65-byte compact (recovery header + r || s),
 * base64. Recovered HASH160 must match the P2PKH (or token-aware P2PKH) cashaddr.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/ripemd160.js";
import { sha256 } from "@noble/hashes/sha256.js";
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
} from "./bytes.ts";
import { decodeCashAddress, hashEquals, isP2pkhType } from "./cashaddr.ts";

const BITCOIN_MESSAGE_PREFIX = concatBytes(
  Uint8Array.of(24),
  new TextEncoder().encode("Bitcoin Signed Message:\n")
);

export interface BchVerifyResult {
  valid: boolean;
  recoveredHash?: Uint8Array;
  error?: string;
}

function encodeCompactSize(n: number): Uint8Array {
  if (n < 0) throw new Error("Negative compact size");
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) {
    return Uint8Array.of(0xfd, n & 0xff, (n >> 8) & 0xff);
  }
  if (n <= 0xffffffff) {
    const out = new Uint8Array(5);
    out[0] = 0xfe;
    out[1] = n & 0xff;
    out[2] = (n >> 8) & 0xff;
    out[3] = (n >> 16) & 0xff;
    out[4] = (n >> 24) & 0xff;
    return out;
  }
  throw new Error("Message too long");
}

export function bitcoinMessageHash(message: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  const payload = concatBytes(
    BITCOIN_MESSAGE_PREFIX,
    encodeCompactSize(messageBytes.length),
    messageBytes
  );
  return sha256(sha256(payload));
}

export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

function parseCompactSignature(
  signature: string
): { recovery: number; compressed: boolean; compact: Uint8Array } {
  const raw = base64ToBytes(signature);
  if (raw.length === 65) {
    const header = raw[0];
    if (header === undefined) throw new Error("Empty signature");
    const flag = header - 27;
    if (flag < 0 || flag > 15) {
      throw new Error("Invalid signature recovery header");
    }
    return {
      recovery: flag & 3,
      compressed: (flag & 4) !== 0,
      compact: raw.slice(1),
    };
  }
  if (raw.length === 64) {
    return { recovery: -1, compressed: true, compact: raw };
  }
  throw new Error("Signature must be 64 or 65 bytes");
}

function recoverHash160(
  msgHash: Uint8Array,
  compact: Uint8Array,
  recovery: number,
  compressed: boolean
): Uint8Array {
  const sig = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery);
  const point = sig.recoverPublicKey(msgHash);
  const pub = point.toBytes(compressed);
  return hash160(pub);
}

export function verifyBchMessage(
  message: string,
  address: string,
  signature: string
): BchVerifyResult {
  if (!message || !address || !signature) {
    return { valid: false, error: "Missing message, address, or signature" };
  }

  let decoded;
  try {
    decoded = decodeCashAddress(address);
  } catch (e) {
    return {
      valid: false,
      error: `Invalid cashaddr: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!isP2pkhType(decoded.type)) {
    return {
      valid: false,
      error: "Signed messages are only defined for P2PKH (q/z) addresses",
    };
  }

  let parsed;
  try {
    parsed = parseCompactSignature(signature);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const msgHash = bitcoinMessageHash(message);
  const recoveries =
    parsed.recovery >= 0 ? [parsed.recovery] : [0, 1, 2, 3];

  for (const rec of recoveries) {
    try {
      const recoveredHash = recoverHash160(
        msgHash,
        parsed.compact,
        rec,
        parsed.compressed
      );
      if (hashEquals(address, recoveredHash)) {
        return { valid: true, recoveredHash };
      }
    } catch {
      // try next recovery id
    }
  }

  if (parsed.recovery >= 0 && parsed.compressed) {
    for (const rec of recoveries) {
      try {
        const recoveredHash = recoverHash160(
          msgHash,
          parsed.compact,
          rec,
          false
        );
        if (hashEquals(address, recoveredHash)) {
          return { valid: true, recoveredHash };
        }
      } catch {
        // try next
      }
    }
  }

  return {
    valid: false,
    error: "Signature does not match the cashaddr and message",
  };
}

export function signBchMessage(
  message: string,
  privateKey: Uint8Array,
  compressed = true
): string {
  if (privateKey.length !== 32) {
    throw new Error("BCH private key must be 32 bytes");
  }
  const msgHash = bitcoinMessageHash(message);
  const sig = secp256k1.sign(msgHash, privateKey);
  const recovery = sig.recovery;
  if (recovery === undefined) {
    throw new Error("Missing signature recovery bit");
  }
  const header = 27 + recovery + (compressed ? 4 : 0);
  const compact = concatBytes(Uint8Array.of(header), sig.toBytes("compact"));
  return bytesToBase64(compact);
}

export function pubkeyFromPrivateKey(
  privateKey: Uint8Array,
  compressed = true
): Uint8Array {
  return secp256k1.getPublicKey(privateKey, compressed);
}
