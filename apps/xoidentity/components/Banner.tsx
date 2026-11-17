"use client";

import { useState } from "react";
import { siteConfig } from "@/lib/config";
import { copyText } from "@/lib/copy";

function shortAddress(address: string): string {
  if (address.length <= 28) return address;
  return `${address.slice(0, 18)}…${address.slice(-8)}`;
}

export function Banner() {
  const [copied, setCopied] = useState(false);
  const address = siteConfig.ember2026Address;
  const explorer = `https://blockchair.com/bitcoin-cash/address/${address.replace(/^bitcoincash:/, "")}`;

  return (
    <div className="border-b border-bch-500/25 bg-ink-950/90">
      <div className="no-scrollbar mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 py-2 text-xs sm:px-6">
        <span className="shrink-0 rounded-full border border-bch-500/40 bg-bch-500/10 px-2.5 py-1 font-medium tracking-[0.14em] text-bch-400">
          BLAZE 2026
        </span>
        <a href={siteConfig.widgetFactoryUrl} target="_blank" rel="noreferrer" className="shrink-0 text-slate-300 no-underline hover:text-white">
          Widget Factory
        </a>
        <span className="text-slate-600" aria-hidden>/</span>
        <a href={siteConfig.githubUrl} target="_blank" rel="noreferrer" className="shrink-0 text-slate-300 no-underline hover:text-white">
          GitHub
        </a>
        <span className="text-slate-600" aria-hidden>/</span>
        <a href={explorer} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-amber-200 no-underline hover:text-amber-100">
          EMBER2026
        </a>
        <button
          type="button"
          className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-amber-100/90 hover:bg-white/10"
          onClick={() => {
            void copyText(address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? "Copied" : shortAddress(address)}
        </button>
      </div>
    </div>
  );
}
