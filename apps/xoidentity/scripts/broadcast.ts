import { runMainnet } from "../lib/run-mainnet.ts";

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes("blockchain.transaction.subscribe")) return;
  if (message.includes("blockchain.transaction.dsproof.subscribe")) return;
  console.error(reason);
  process.exitCode = 1;
});

const result = await runMainnet();
for (const claim of result.claims) {
  console.log(`${claim.name} ${claim.explorer}`);
}
process.exit(0);
