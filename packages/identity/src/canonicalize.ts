/**
 * Deterministic JSON: recursively sorted keys, no whitespace, no undefined.
 * This is the Identity Bridge canonicalization, kept byte-stable for hashing.
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return value;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers are not allowed in canonical form");
    }
    return value;
  }
  if (t !== "object") {
    throw new Error(`Unsupported canonical type: ${t}`);
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) {
      sorted[key] = sortKeys(v);
    }
  }
  return sorted;
}
