export {
  AUTH_DOMAIN,
  AUTH_KIND,
  BCH_PROOF_DOMAIN,
  BINDING_D_TAG,
  BINDING_KIND,
  DEFAULT_CHALLENGE_TTL_SECONDS,
  DEFAULT_RELAYS,
  MAX_CHALLENGE_TTL_SECONDS,
  MAX_CLOCK_SKEW_SECONDS,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  PURPOSE_IDENTITY_BINDING,
  TOKEN_COMMITMENT_DOMAIN,
} from "./constants.ts";

export type {
  AuthChallenge,
  AuthResponse,
  AuthResult,
  AuthStatus,
  BchNetwork,
  BindingDraft,
  BindingStatement,
  CashAddressTypeName,
  CashTokenCommitment,
  CreateChallengeParams,
  CreateStatementParams,
  DecodedCashAddress,
  DiscoverOptions,
  IdentityBinding,
  NostrEvent,
  PublishResult,
  ReplayStore,
  UnsignedNostrEvent,
  VerificationResult,
  VerificationStatus,
  VerifyAuthOptions,
  VerifyOptions,
} from "./types.ts";

export { canonicalize } from "./canonicalize.ts";

export {
  CashAddressType,
  decodeCashAddress,
  encodeCashAddress,
  hashEquals,
  isP2pkhType,
  networkFromPrefix,
  normalizeCashAddress,
  prefixForNetwork,
} from "./cashaddr.ts";

export {
  bitcoinMessageHash,
  hash160,
  pubkeyFromPrivateKey,
  signBchMessage,
  verifyBchMessage,
} from "./bch-message.ts";

export {
  assertBindingStatement,
  buildBchSigningMessage,
  computeBindingId,
  createBindingDraft,
  createStatement,
  identityTagValue,
  normalizeNostrPubkey,
  parseBchSigningMessage,
} from "./statement.ts";

export {
  createUnsignedBindingEvent,
  findTag,
  signBindingEvent,
  verifyNostrEvent,
} from "./event.ts";

export {
  assembleIdentityBinding,
  assertIdentityBinding,
  bindingFromEvent,
  cashAddressFromPrivateKey,
  exportIdentityBinding,
  generateNostrPrivateKey,
  importIdentityBinding,
  nostrPubkeyFromPrivateKey,
  signBinding,
} from "./binding.ts";
export type { SignBindingKeys } from "./binding.ts";

export { assertVerified, verify } from "./verify.ts";

export {
  InMemoryReplayStore,
  buildAuthSigningMessage,
  createChallenge,
  createUnsignedAuthEvent,
  getDefaultReplayStore,
  signAuthResponse,
  verifyAuthResponse,
} from "./auth.ts";

export {
  buildAddressFilter,
  buildAuthorFilter,
  buildBindingIdFilter,
  discoverByAddress,
  discoverByAuthor,
  discoverByBindingId,
  getDefaultRelays,
  latestVerifiedBinding,
  publishBinding,
} from "./discovery.ts";

export { prepareCashTokenCommitment } from "./cashtokens.ts";
