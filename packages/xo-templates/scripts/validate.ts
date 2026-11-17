import { parseTemplate } from "@xo-cash/utils";
import { identityBindTemplate } from "../src/identity-bind.ts";
import { payToBoundIdentityTemplate } from "../src/pay-to-bound-identity.ts";

const identity = parseTemplate(identityBindTemplate);
const payment = parseTemplate(payToBoundIdentityTemplate);

if (identity.name !== "Identity bind" || payment.name !== "Pay bound identity") {
  throw new Error("Parsed templates lost their names");
}

console.log("identity-bind ok");
console.log("pay-to-bound-identity ok");
