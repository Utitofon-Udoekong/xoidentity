"use client";

import { useEffect, useState } from "react";
import { verify } from "@bchblaze/identity";

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

export function Desk() {
  const [result, setResult] = useState<ResultFile | null>(null);
  const [bindingNote, setBindingNote] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

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
          <button
            type="button"
            className="mt-3 border border-ink bg-paper px-3 py-1.5 text-sm hover:bg-ink hover:text-paper"
            onClick={() => {
              const checked = verify(pasted);
              if (!checked.ok || checked.binding === undefined) {
                setPasteNote(checked.details.join(" "));
                return;
              }
              if (checked.binding.statement.bchNetwork !== "mainnet") {
                setPasteNote("The binding is valid, and its address is not mainnet.");
                return;
              }
              setPasteNote(checked.binding.statement.bchAddress);
            }}
          >
            Verify
          </button>
          {pasteNote ? <p className="mt-3 break-all font-mono text-xs">{pasteNote}</p> : null}
      </section>
    </div>
  );
}
