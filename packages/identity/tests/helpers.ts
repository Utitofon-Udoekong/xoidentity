import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  cashAddressFromPrivateKey,
  generateNostrPrivateKey,
  nostrPubkeyFromPrivateKey,
  signBinding,
} from "../src/index.ts";
import type { IdentityBinding } from "../src/index.ts";

export function randomBchPrivateKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

export function makeSignedBinding(overrides?: {
  expiresAt?: number;
  createdAt?: number;
  network?: "mainnet" | "chipnet" | "testnet";
}): {
  binding: IdentityBinding;
  bchPrivateKey: Uint8Array;
  nostrPrivateKey: Uint8Array;
} {
  const bchPrivateKey = randomBchPrivateKey();
  const nostrPrivateKey = generateNostrPrivateKey();
  const network = overrides?.network ?? "mainnet";
  const bchAddress = cashAddressFromPrivateKey(bchPrivateKey, network);
  const nostrPubkey = nostrPubkeyFromPrivateKey(nostrPrivateKey);
  const binding = signBinding(
    {
      bchAddress,
      bchNetwork: network,
      nostrPubkey,
      createdAt: overrides?.createdAt,
      expiresAt: overrides?.expiresAt,
    },
    { bchPrivateKey, nostrPrivateKey }
  );
  return { binding, bchPrivateKey, nostrPrivateKey };
}
