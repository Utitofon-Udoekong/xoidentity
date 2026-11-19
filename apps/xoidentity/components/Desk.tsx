"use client";

import { useEffect, useState } from "react";
import {
  computeBindingId,
  decodeCashAddress,
  isP2pkhType,
  normalizeCashAddress,
  verify,
  type BindingStatement,
} from "@bchblaze/identity";

interface ClaimRow {
  name: "commitBinding" | "payBoundIdentity";
  txid: string;
  explorer: string;
}

interface ResultFile {
  network: "mainnet" | "chipnet";
  fundingAddress: string;
  faucetTxid: string | null;
  boundAddress: string;
  binding: unknown;
  claims: ClaimRow[];
}

function claimLabel(name: ClaimRow["name"]): string {
  switch (name) {
    case "commitBinding":
      return "Committed";
    case "payBoundIdentity":
      return "Paid";
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
}

const field = "mt-3 w-full border border-ink bg-paper px-3 py-2 font-mono text-xs";

type PasteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "checked";
      commitment: "ok" | "fail";
      locking: "ok" | "fail";
      commitmentHex: string;
      lockingHex: string;
    };

function lockingScript(hash: Uint8Array): string {
  const lock = new Uint8Array(25);
  lock[0] = 0x76;
  lock[1] = 0xa9;
  lock[2] = 0x14;
  lock.set(hash, 3);
  lock[23] = 0x88;
  lock[24] = 0xac;
  return Array.from(lock, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isNetwork(value: unknown): value is BindingStatement["bchNetwork"] {
  return value === "mainnet" || value === "chipnet" || value === "testnet";
}

function readStatement(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { statement?: unknown };
  const statement = record.statement;
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) return null;
  return statement as Record<string, unknown>;
}

function checkStatement(statement: BindingStatement | Record<string, unknown>): PasteState {
  let commitment: "ok" | "fail" = "fail";
  let commitmentHex = "";
  let locking: "ok" | "fail" = "fail";
  let lockingHex = "";
  if (!isNetwork(statement.bchNetwork) || typeof statement.bchAddress !== "string") {
    return { status: "checked", commitment, locking, commitmentHex, lockingHex };
  }
  let normalized = "";
  try {
    normalized = normalizeCashAddress(statement.bchAddress, statement.bchNetwork);
    const decoded = decodeCashAddress(normalized);
    if (statement.bchNetwork === "mainnet" && isP2pkhType(decoded.type) && decoded.hash.length === 20) {
      lockingHex = lockingScript(decoded.hash);
      locking = "ok";
    }
  } catch {
    locking = "fail";
  }
  try {
    if (
      normalized !== "" &&
      typeof statement.nostrPubkey === "string" &&
      typeof statement.createdAt === "number" &&
      typeof statement.nonce === "string" &&
      typeof statement.bindingId === "string"
    ) {
      commitmentHex = computeBindingId({
        protocol: "bchblaze-id",
        version: "1.0.0",
        bchAddress: normalized,
        bchNetwork: statement.bchNetwork,
        nostrPubkey: statement.nostrPubkey.trim().toLowerCase(),
        createdAt: statement.createdAt,
        expiresAt: typeof statement.expiresAt === "number" ? statement.expiresAt : undefined,
        purpose: "identity-binding",
        nonce: statement.nonce.trim().toLowerCase(),
      });
      commitment = commitmentHex === statement.bindingId.trim().toLowerCase() ? "ok" : "fail";
    }
  } catch {
    commitment = "fail";
  }
  return { status: "checked", commitment, locking, commitmentHex, lockingHex };
}

function inspectPaste(raw: string): PasteState {
  const trimmed = raw.trim();
  if (!trimmed) return { status: "idle" };
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return { status: "idle" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { status: "error", message: "The record is unreadable." };
  }
  const checked = verify(trimmed);
  if (checked.binding) return checkStatement(checked.binding.statement);
  const rawStatement = readStatement(parsed);
  if (rawStatement) return checkStatement(rawStatement);
  return { status: "error", message: checked.details[0] ?? "The record is unreadable." };
}

export function Desk() {
  const [result, setResult] = useState<ResultFile | null>(null);
  const [bindingNote, setBindingNote] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const paste = inspectPaste(pasted);

  useEffect(() => {
    let cancelled = false;
    void fetch("/mainnet-result.json")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ResultFile;
      })
      .then((body) => {
        if (cancelled || body === null) return;
        setResult(body);
        const checked = verify(JSON.stringify(body.binding));
        setBindingNote(checked.ok ? "Verified" : checked.details.join(" "));
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="max-w-xl">Commit a binding, then pay that address.</h1>
        <p className="lede">
          Two XO templates. One writes the binding id into a CashToken. The other pays the Bitcoin Cash address inside it.
        </p>
      </div>

      <section>
          <h2>Mainnet</h2>
          {result === null || result.network !== "mainnet" ? (
            <p className="mt-3 text-sm text-ink/60">No mainnet broadcast yet.</p>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <p className="break-all font-mono text-xs">{result.boundAddress}</p>
              {bindingNote ? <p className="text-ink/70">{bindingNote}</p> : null}
              {result.claims.map((claim) => (
                <article key={claim.txid}>
                  <p>{claimLabel(claim.name)}</p>
                  <a href={claim.explorer} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs">
                    {claim.txid}
                  </a>
                </article>
              ))}
            </div>
          )}
      </section>

      <section className="border-t border-ink pt-6">
          <h2>Check a binding</h2>
          <p className="lede">Paste a mainnet Nostrobridge record. A valid one names the address the payment template pays.</p>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={5}
            className={field}
            placeholder="Binding JSON"
          />
          {paste.status === "checked" ? (
            <div className="mt-4 space-y-2">
              <p className="break-all font-mono text-xs">{paste.commitment === "ok" ? paste.commitmentHex : "Mismatch"}</p>
              <p className="break-all font-mono text-xs">{paste.locking === "ok" ? paste.lockingHex : "Mismatch"}</p>
            </div>
          ) : null}
          {paste.status === "error" ? <p className="mt-4 text-sm">{paste.message}</p> : null}
      </section>
    </div>
  );
}
