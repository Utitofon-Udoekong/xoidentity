export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) {
    throw new Error("Invalid hex");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error("Invalid base64");
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new Error("No CSPRNG available");
}

export function isHex(value: string, byteLength: number): boolean {
  return new RegExp(`^[0-9a-f]{${byteLength * 2}}$`).test(value);
}
