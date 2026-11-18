const PRESENTATION = "https://docs.google.com/presentation/d/1tAXM_mXYZAIU1D6sTPabc3-kmPcuEnWjl8D15JsQtdY/edit?usp=sharing";
const GITHUB = "https://github.com/Utitofon-Udoekong/xoidentity";
const EMBER = "bitcoincash:zq5hh46r4kudjpsayg58gu99h03p00nw4csaumqgy0";

export function HomeBanner() {
  return (
    <div className="border-b border-ink bg-ink !text-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5 text-sm">
        <a className="!text-paper" href={PRESENTATION} target="_blank" rel="noreferrer">
          Presentation
        </a>
        <a className="!text-paper" href={GITHUB} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a
          className="break-all font-mono text-xs !text-paper"
          href={`https://blockchair.com/bitcoin-cash/address/${EMBER.replace(/^bitcoincash:/, "")}`}
          target="_blank"
          rel="noreferrer"
          title="EMBER2026 donations"
        >
          EMBER2026 {EMBER}
        </a>
      </div>
    </div>
  );
}
