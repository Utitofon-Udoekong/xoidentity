"use client";

import { useEffect, useState } from "react";
import { verify } from "@bchblaze/identity";

interface ClaimRow {
  name: "commitBinding" | "payBoundIdentity";
  txid: string;
  explorer: string;
}

interface ResultFile {
  network: "chipnet";
  fundingAddress: string;
  faucetTxid: string | null;
  boundAddress: string;
  binding: unknown;
  claims: ClaimRow[];
}

function claimLabel(name: ClaimRow["name"]): string {
  switch (name) {
    case "commitBinding":
      return "Identity committed";
    case "payBoundIdentity":
      return "Paid the bound address";
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
}

export function Desk() {
  const [result, setResult] = useState<ResultFile | null>(null);
  const [bindingNote, setBindingNote] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/chipnet-result.json")
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as ResultFile;
      })
      .then((body) => {
        if (cancelled || body === null) return;
        setResult(body);
        const checked = verify(JSON.stringify(body.binding));
        setBindingNote(checked.ok ? "The stored binding verifies offline." : checked.details.join(" "));
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
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-bch-400">Build with XO · Migrate to XO</p>
        <h1 className="text-4xl text-white sm:text-5xl">XOIdentity</h1>
        <p className="text-slate-300">
          Two XO templates. One publishes the id of a bchblaze-id binding. The other pays the Bitcoin Cash address
          inside that binding. The engine creates the invitation, fills it, signs it, and broadcasts it on chipnet.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-ink-900/80 p-5 text-sm text-slate-300">
        <h2 className="text-lg text-white">Run the invitation</h2>
        <p className="mt-2">
          From the repo root, <span className="font-mono text-slate-100">pnpm --filter @bchblaze/xoidentity broadcast</span>.
          The script opens a chipnet engine, imports both templates plus P2PKH, asks the chipnet.bch.ninja faucet for
          coins, then runs <span className="font-mono">commitBinding</span> and <span className="font-mono">payBoundIdentity</span>.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-ink-900/80 p-5">
        <h2 className="text-lg text-white">Chipnet transactions</h2>
        {result === null ? (
          <p className="mt-3 text-sm text-slate-400">No broadcast has been recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <p>Funding address <span className="font-mono text-xs text-slate-300">{result.fundingAddress}</span></p>
            <p>Bound address <span className="font-mono text-xs text-bch-400">{result.boundAddress}</span></p>
            {bindingNote ? <p>{bindingNote}</p> : null}
            {result.claims.map((claim) => (
              <article key={claim.txid} className="rounded-xl border border-white/10 p-4">
                <p className="text-white">{claimLabel(claim.name)}</p>
                <a href={claim.explorer} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-xs text-amber-200">
                  {claim.txid}
                </a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-ink-900/80 p-5">
        <h2 className="text-lg text-white">Check a Nostro binding</h2>
        <p className="mt-2 text-sm text-slate-400">
          Paste a bchblaze-id event from Nostrobridge. A verified cashaddr is the locking script <span className="font-mono">payBoundIdentity</span> pays.
          The XO invitation replaces the manual send. The kind 30734 event is still the binding.
        </p>
        <textarea
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          rows={5}
          spellCheck={false}
          className="mt-3 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs"
          placeholder='{"kind":30734,...}'
        />
        <button
          type="button"
          className="mt-3 rounded-xl border border-nostr-400/40 px-4 py-2 text-sm"
          onClick={() => {
            const checked = verify(pasted);
            if (!checked.ok || checked.binding === undefined) {
              setPasteNote(checked.details.join(" "));
              return;
            }
            setPasteNote(`Verified. Pay ${checked.binding.statement.bchAddress}. Binding ${checked.binding.statement.bindingId}.`);
          }}
        >
          Verify binding
        </button>
        {pasteNote ? <p className="mt-3 text-sm text-slate-200">{pasteNote}</p> : null}
      </section>
    </div>
  );
}
