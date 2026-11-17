import { sha256 } from "@noble/hashes/sha256.js";
import { TOKEN_COMMITMENT_DOMAIN } from "./constants.ts";
import { bytesToHex } from "./bytes.ts";
import { canonicalize } from "./canonicalize.ts";
import { verify } from "./verify.ts";
import type { CashTokenCommitment, IdentityBinding } from "./types.ts";

/**
 * Prepare a 32-byte commitment of a verified binding for a CashTokens NFT.
 * The NFT commitment field is at most 40 bytes; 32 bytes of SHA-256 fit.
 *
 * Committing to bindingId + event id + BCH signature pins this exact proof
 * on-chain. A later rebind (new event) will not match the NFT.
 */
export function prepareCashTokenCommitment(
  binding: IdentityBinding
): CashTokenCommitment {
  const verified = verify(binding);
  if (!verified.ok) {
    throw new Error(
      `Cannot commit an unverified binding (${verified.status}): ${verified.details.join("; ")}`
    );
  }

  const payload = canonicalize({
    bchAddress: binding.statement.bchAddress,
    bchSignature: binding.bchSignature,
    bindingId: binding.statement.bindingId,
    nostrEventId: binding.event.id,
    nostrPubkey: binding.statement.nostrPubkey,
  });
  const bytes = sha256(
    new TextEncoder().encode(`${TOKEN_COMMITMENT_DOMAIN}\n${payload}`)
  );

  return {
    bytes,
    hex: bytesToHex(bytes),
    domain: TOKEN_COMMITMENT_DOMAIN,
    bindingId: binding.statement.bindingId,
    nostrEventId: binding.event.id,
  };
}
