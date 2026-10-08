export { POLYGON_CHAIN_ID, TOKENS, V3_FACTORY, V3_FEE_TIERS, tokenKey, poolKey, parsePoolKey,
  type Address, type Protocol, type TokenRecord, type PoolRecord } from "./chains/polygon";

export {
  V3_POOL_500,
  V3_QUOTER,
  V3_SWAP_ROUTER,
  minimumOutput,
  parseExactInput,
  validateSwapQuote,
  type SwapIntent,
  type SwapQuote,
} from "./swap/swap";

export {
  POLYGON_UNIVERSAL_ROUTER_212,
  UNIVERSAL_ROUTER_VERSION,
  validateTradingIntent,
  validateTradingQuoteSummary,
  type TradingIntent,
  type TradingQuoteSummary,
} from "./swap/trading";

export { TRADING_ROUTING_POLICY, inspectTradingRoute } from "./swap/trading-route";

export { POLYGON_PERMIT2, PERMIT2_POLICY, validatePermit2Data, type Permit2Data } from "./swap/permit2";

export { summarizeTradingFailure, type TradingQuoteFailureCode } from "./swap/trading-failure";

export * from "./swap/swap-calldata";
export * from "./swap/permit-signature";
export * from "./transaction/transaction-receipt";
export { BASE_SEPOLIA_CANDIDATE, BASE_SEPOLIA_CHAIN_ID } from "./chains/testnet";
export { parseTestnetDepth, testnetDepthSchema, type TestnetDepthReport } from "./discovery/testnet-depth";
export { createTestnetSwapDomain, TESTNET_SWAP_POLICY, testnetQuoteExpiresAt, buildTestnetSwapTransaction, inspectTestnetSwapTransaction,
  planTestnetTokenApproval, parseTestnetSwapIntent, parseTestnetSwapQuote, testnetSwapIntentFromQuote, type TestnetSwapIntent, type TestnetSwapQuote, type TestnetChainSwapIntent, type TestnetChainSwapQuote,
  type TestnetSwapTransaction, type TestnetApprovalPlan } from "./swap/testnet-swap";
export { createTestnetLpPositionDomain, type TestnetChainLpRequest, type TestnetChainLpPage, testnetLpRequestSchema, testnetLpPageSchema, parseTestnetLpPage, type TestnetLpPage, type TestnetLpRequest } from "./liquidity/testnet-lp";

export * from "./liquidity/testnet-lp-wallet";
export * from "./transaction/testnet-transaction-fees";
export * from "./transaction/testnet-metamask";
export * from "./configuration/hosted-config";
export * from "./swap/testnet-inputs";
export * from "./liquidity/testnet-lp-range";
export * from "./swap/testnet-swap-pools";

export { TESTNET_CHAIN_CONFIGS, testnetChainConfig, type TestnetChainConfig, type TestnetChainId } from "./chains/testnet-chain-config";
