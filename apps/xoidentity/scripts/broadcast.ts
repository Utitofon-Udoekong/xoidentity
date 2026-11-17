import { runChipnet } from "../lib/run-chipnet.ts";

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes("blockchain.transaction.subscribe")) return;
  console.error(reason);
  process.exitCode = 1;
});

const result = await runChipnet();
for (const claim of result.claims) {
  console.log(`${claim.name} ${claim.explorer}`);
}
