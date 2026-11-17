import { describe, expect, it } from "vitest";
import {
  BINDING_D_TAG,
  BINDING_KIND,
  buildAddressFilter,
  buildAuthorFilter,
  buildBindingIdFilter,
  identityTagValue,
} from "../src/index.ts";
import { makeSignedBinding } from "./helpers.ts";

describe("discovery filters", () => {
  it("queries kind 30734 by author and stable d-tag", () => {
    const { binding } = makeSignedBinding();
    const filter = buildAuthorFilter(binding.statement.nostrPubkey);
    expect(filter.kinds).toEqual([BINDING_KIND]);
    expect(filter.authors).toEqual([binding.statement.nostrPubkey]);
    expect(filter["#d"]).toEqual([BINDING_D_TAG]);
  });

  it("queries the NIP-39 i-tag for a cashaddr", () => {
    const { binding } = makeSignedBinding();
    const filter = buildAddressFilter(binding.statement.bchAddress);
    expect(filter["#i"]).toEqual([identityTagValue(binding.statement.bchAddress)]);
    expect(filter.kinds).toEqual([BINDING_KIND]);
  });

  it("queries the binding tag by bindingId", () => {
    const { binding } = makeSignedBinding();
    const filter = buildBindingIdFilter(binding.statement.bindingId);
    expect(filter["#binding"]).toEqual([binding.statement.bindingId]);
  });
});
