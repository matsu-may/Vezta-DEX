export const POLYGON_CHAIN_ID = 137 as const;

export type Address = `0x${string}`;
export type Protocol = "v3" | "v4";

export interface TokenRecord {
  chainId: number;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export interface PoolRecord {
  id: string;
  chainId: number;
  protocol: Protocol;
  reference: Address;
  token0: TokenRecord;
  token1: TokenRecord;
  feeTier: number;
  activeLiquidity: string | null;
  tvlUsd: null;
  volume24hUsd: null;
  source: "polygon-rpc";
  observedAt: string;
  blockNumber: string;
}

export const TOKENS = {
  USDC: {
    chainId: POLYGON_CHAIN_ID,
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    symbol: "USDC",
    name: "USD Coin (native)",
    decimals: 6,
  },
  WETH: {
    chainId: POLYGON_CHAIN_ID,
    address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
  },
} as const satisfies Record<string, TokenRecord>;

export const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const V4_POOL_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function tokenKey(chainId: number, address: string): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !ADDRESS_PATTERN.test(address)) {
    throw new Error("Invalid token identity");
  }
  return `${chainId}:${address.toLowerCase()}`;
}

export function poolKey(chainId: number, protocol: Protocol, reference: string): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Invalid chain ID");
  }
  if (protocol === "v3" ? !ADDRESS_PATTERN.test(reference) : !V4_POOL_ID_PATTERN.test(reference)) {
    throw new Error("Invalid pool reference");
  }
  return `${chainId}:${protocol}:${reference.toLowerCase()}`;
}

export function parsePoolKey(value: string): {
  chainId: typeof POLYGON_CHAIN_ID;
  protocol: Protocol;
  reference: Address;
} {
  const parts = value.split(":");
  if (parts.length !== 3 || parts[0] !== String(POLYGON_CHAIN_ID)) {
    throw new Error("Unsupported pool chain");
  }
  const protocol = parts[1];
  if (protocol !== "v3" && protocol !== "v4") {
    throw new Error("Unsupported pool protocol");
  }
  const reference = parts[2];
  poolKey(POLYGON_CHAIN_ID, protocol, reference);
  return { chainId: POLYGON_CHAIN_ID, protocol, reference: reference.toLowerCase() as Address };
}

export {
  V3_POOL_500,
  V3_QUOTER,
  V3_SWAP_ROUTER,
  minimumOutput,
  parseExactInput,
  validateSwapQuote,
  type SwapIntent,
  type SwapQuote,
} from "./swap";

export {
  POLYGON_UNIVERSAL_ROUTER_212,
  UNIVERSAL_ROUTER_VERSION,
  validateTradingIntent,
  validateTradingQuoteSummary,
  type TradingIntent,
  type TradingQuoteSummary,
} from "./trading";

export { TRADING_ROUTING_POLICY, inspectTradingRoute } from "./trading-route";

export { POLYGON_PERMIT2, PERMIT2_POLICY, validatePermit2Data, type Permit2Data } from "./permit2";

export { summarizeTradingFailure, type TradingQuoteFailureCode } from "./trading-failure";

export * from "./swap-calldata";
export * from "./permit-signature";
export * from "./transaction-receipt";
export { BASE_SEPOLIA_CANDIDATE, BASE_SEPOLIA_CHAIN_ID } from "./testnet";
export { parseTestnetDepth, testnetDepthSchema, type TestnetDepthReport } from "./testnet-depth";
export { TESTNET_SWAP_POLICY, testnetQuoteExpiresAt, buildTestnetSwapTransaction, inspectTestnetSwapTransaction,
  planTestnetTokenApproval, parseTestnetSwapIntent, parseTestnetSwapQuote, type TestnetSwapIntent, type TestnetSwapQuote,
  type TestnetSwapTransaction, type TestnetApprovalPlan } from "./testnet-swap";
export { testnetLpRequestSchema, testnetLpPageSchema, parseTestnetLpPage, type TestnetLpPage, type TestnetLpRequest } from "./testnet-lp";

export * from "./testnet-lp-wallet";
export * from "./testnet-transaction-fees";
export * from "./testnet-metamask";
