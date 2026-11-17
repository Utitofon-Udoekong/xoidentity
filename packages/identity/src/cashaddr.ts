import { concatBytes, timingSafeEqual } from "./bytes.ts";
import type { BchNetwork, CashAddressTypeName, DecodedCashAddress } from "./types.ts";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHARSET_MAP: Record<string, number> = Object.fromEntries(
  [...CHARSET].map((c, i) => [c, i])
);

const POLYMOD_GENERATORS = [
  0x98f2bc8e61n,
  0x79b76d99e2n,
  0xf33e5fb3c4n,
  0xae2eabe2a8n,
  0x1e4f43e470n,
] as const;

export const CashAddressType = {
  p2pkh: 0,
  p2sh: 1,
  p2pkhWithTokens: 2,
  p2shWithTokens: 3,
} as const;

const TYPE_NAME_BY_VALUE: Record<number, CashAddressTypeName> = {
  [CashAddressType.p2pkh]: "p2pkh",
  [CashAddressType.p2sh]: "p2sh",
  [CashAddressType.p2pkhWithTokens]: "p2pkh-tokens",
  [CashAddressType.p2shWithTokens]: "p2sh-tokens",
};

const TYPE_VALUE_BY_NAME: Record<CashAddressTypeName, number> = {
  p2pkh: CashAddressType.p2pkh,
  p2sh: CashAddressType.p2sh,
  "p2pkh-tokens": CashAddressType.p2pkhWithTokens,
  "p2sh-tokens": CashAddressType.p2shWithTokens,
};

const HASH_SIZE_BITS: Record<number, number> = {
  20: 0,
  24: 1,
  28: 2,
  32: 3,
  40: 4,
  48: 5,
  56: 6,
  64: 7,
};

const HASH_BYTES_BY_SIZE_BITS: Record<number, number> = {
  0: 20,
  1: 24,
  2: 28,
  3: 32,
  4: 40,
  5: 48,
  6: 56,
  7: 64,
};

export function prefixForNetwork(network: BchNetwork): string {
  switch (network) {
    case "mainnet":
      return "bitcoincash";
    case "chipnet":
    case "testnet":
      return "bchtest";
    default: {
      const _exhaustive: never = network;
      throw new Error(`Unsupported network: ${_exhaustive}`);
    }
  }
}

export function networkFromPrefix(prefix: string): BchNetwork | "regtest" {
  switch (prefix) {
    case "bitcoincash":
      return "mainnet";
    case "bchtest":
      return "testnet";
    case "bchreg":
      return "regtest";
    default:
      throw new Error(`Unknown cashaddr prefix: ${prefix}`);
  }
}

function polymod(values: number[]): bigint {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    if (c0 & 1n) c ^= POLYMOD_GENERATORS[0];
    if (c0 & 2n) c ^= POLYMOD_GENERATORS[1];
    if (c0 & 4n) c ^= POLYMOD_GENERATORS[2];
    if (c0 & 8n) c ^= POLYMOD_GENERATORS[3];
    if (c0 & 16n) c ^= POLYMOD_GENERATORS[4];
  }
  return c;
}

function prefixToUint5(prefix: string): number[] {
  const out: number[] = [];
  for (const ch of prefix) {
    const code = ch.charCodeAt(0);
    if (code < 33 || code > 126) {
      throw new Error("Invalid cashaddr prefix character");
    }
    out.push(code & 31);
  }
  return out;
}

function convertBits(
  data: ArrayLike<number>,
  fromBits: number,
  toBits: number,
  pad: boolean
): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value === undefined || value < 0 || value >> fromBits) {
      throw new Error("Invalid value in convertBits");
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    throw new Error("Invalid padding in convertBits");
  }
  return out;
}

function checksumFrom(prefix: string, payload5: number[]): number[] {
  const values = [...prefixToUint5(prefix), 0, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0];
  let mod = polymod(values) ^ 1n;
  const checksum: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksum.push(Number((mod >> BigInt(5 * (7 - i))) & 31n));
  }
  return checksum;
}

function verifyChecksum(prefix: string, payloadAndChecksum: number[]): boolean {
  const values = [...prefixToUint5(prefix), 0, ...payloadAndChecksum];
  return polymod(values) === 1n;
}

export function encodeCashAddress(
  prefix: string,
  type: CashAddressTypeName,
  hash: Uint8Array
): string {
  const sizeBits = HASH_SIZE_BITS[hash.length];
  if (sizeBits === undefined) {
    throw new Error(`Unsupported hash length ${hash.length}`);
  }
  const typeBits = TYPE_VALUE_BY_NAME[type];
  const versionByte = (typeBits << 3) | sizeBits;
  const payload = concatBytes(Uint8Array.of(versionByte), hash);
  const payload5 = convertBits(payload, 8, 5, true);
  const checksum = checksumFrom(prefix, payload5);
  const combined = [...payload5, ...checksum];
  return `${prefix}:${combined.map((d) => CHARSET[d]).join("")}`;
}

export function decodeCashAddress(address: string): DecodedCashAddress {
  if (!address) throw new Error("Empty cashaddr");
  const lower = address.toLowerCase();
  const upper = address.toUpperCase();
  if (address !== lower && address !== upper) {
    throw new Error("Mixed-case cashaddr is invalid");
  }
  const normalized = lower;
  const colon = normalized.indexOf(":");
  let prefix: string;
  let payload: string;
  if (colon === -1) {
    prefix = "bitcoincash";
    payload = normalized;
  } else {
    prefix = normalized.slice(0, colon);
    payload = normalized.slice(colon + 1);
  }
  if (!payload) throw new Error("Missing cashaddr payload");

  const payload5: number[] = [];
  for (const ch of payload) {
    const v = CHARSET_MAP[ch];
    if (v === undefined) throw new Error(`Invalid cashaddr character: ${ch}`);
    payload5.push(v);
  }
  if (payload5.length < 8) throw new Error("Cashaddr payload too short");
  if (!verifyChecksum(prefix, payload5)) {
    throw new Error("Invalid cashaddr checksum");
  }

  const payloadNoChecksum = payload5.slice(0, -8);
  const decoded = convertBits(payloadNoChecksum, 5, 8, false);
  if (decoded.length < 1) throw new Error("Empty cashaddr payload");
  const versionByte = decoded[0];
  if (versionByte === undefined) throw new Error("Missing version byte");
  if (versionByte & 0x80) throw new Error("Reserved cashaddr version bit set");

  const typeBits = versionByte >> 3;
  const sizeBits = versionByte & 7;
  const type = TYPE_NAME_BY_VALUE[typeBits];
  if (type === undefined) {
    throw new Error(`Unsupported cashaddr type ${typeBits}`);
  }
  const expectedLen = HASH_BYTES_BY_SIZE_BITS[sizeBits];
  if (expectedLen === undefined) throw new Error("Invalid cashaddr size bits");
  const hashBytes = decoded.slice(1);
  if (hashBytes.length !== expectedLen) {
    throw new Error("Cashaddr hash length does not match version byte");
  }

  return {
    prefix,
    type,
    hash: Uint8Array.from(hashBytes),
    network: networkFromPrefix(prefix),
  };
}

export function normalizeCashAddress(
  address: string,
  expectedNetwork?: BchNetwork
): string {
  let decoded: DecodedCashAddress;
  try {
    decoded = decodeCashAddress(address);
  } catch (first) {
    if (expectedNetwork && !address.includes(":")) {
      const prefixed = `${prefixForNetwork(expectedNetwork)}:${address}`;
      decoded = decodeCashAddress(prefixed);
    } else {
      throw first;
    }
  }

  if (expectedNetwork) {
    const expectedPrefix = prefixForNetwork(expectedNetwork);
    if (decoded.prefix !== expectedPrefix) {
      throw new Error(
        `Address prefix ${decoded.prefix} does not match network ${expectedNetwork}`
      );
    }
  }

  return encodeCashAddress(decoded.prefix, decoded.type, decoded.hash);
}

export function isP2pkhType(type: CashAddressTypeName): boolean {
  switch (type) {
    case "p2pkh":
    case "p2pkh-tokens":
      return true;
    case "p2sh":
    case "p2sh-tokens":
      return false;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown cashaddr type: ${_exhaustive}`);
    }
  }
}

export function hashEquals(address: string, pubkeyHash: Uint8Array): boolean {
  const decoded = decodeCashAddress(address);
  return (
    isP2pkhType(decoded.type) && timingSafeEqual(decoded.hash, pubkeyHash)
  );
}

export function networkCompatible(
  addressNetwork: BchNetwork | "regtest",
  claimed: BchNetwork
): boolean {
  if (claimed === "mainnet") return addressNetwork === "mainnet";
  if (claimed === "testnet" || claimed === "chipnet") {
    return addressNetwork === "testnet";
  }
  const _exhaustive: never = claimed;
  return _exhaustive;
}
