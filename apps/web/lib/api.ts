import { TOKENS, parsePoolKey, poolKey, validateSwapQuote, validateTradingIntent, validateTradingQuoteSummary, type Address, type PoolRecord, type SwapIntent, type SwapQuote, type TokenRecord, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);
const tokenSchema = z.object({
  chainId: z.literal(137),
  address,
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(36),
});
const tokensResponseSchema = z.object({ tokens: z.array(tokenSchema).length(2) }).refine(({ tokens }) =>
  [TOKENS.USDC, TOKENS.WETH].every((expected) => tokens.some((token) =>
    token.address.toLowerCase() === expected.address.toLowerCase() && token.decimals === expected.decimals,
  )),
);
const poolSchema = z.object({
  id: z.string(),
  chainId: z.literal(137),
  protocol: z.literal("v3"),
  reference: address,
  token0: tokenSchema,
  token1: tokenSchema,
  feeTier: z.number().int().positive(),
  activeLiquidity: z.string().regex(/^\d+$/).nullable(),
  tvlUsd: z.null(),
  volume24hUsd: z.null(),
  source: z.literal("polygon-rpc"),
  observedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  blockNumber: z.string().regex(/^\d+$/),
}).refine((pool) => {
  try {
    return pool.id === poolKey(pool.chainId, pool.protocol, pool.reference) &&
      pool.token0.address.toLowerCase() === TOKENS.USDC.address.toLowerCase() &&
      pool.token0.decimals === TOKENS.USDC.decimals &&
      pool.token1.address.toLowerCase() === TOKENS.WETH.address.toLowerCase() &&
      pool.token1.decimals === TOKENS.WETH.decimals;
  } catch {
    return false;
  }
});
const quoteSchema = z.object({
  chainId: z.literal(137),
  protocol: z.literal("v3"),
  pool: address,
  feeTier: z.literal(500),
  tokenIn: address,
  tokenOut: address,
  amountIn: z.string().regex(/^[1-9]\d*$/),
  amountOut: z.string().regex(/^[1-9]\d*$/),
  quoterGasEstimate: z.string().regex(/^\d+$/),
  blockNumber: z.string().regex(/^\d+$/),
  observedAt: z.string(),
  source: z.literal("polygon-rpc"),
});
const tradingQuoteSchema = z.object({
  chainId: z.literal(137),
  swapper: address,
  tokenIn: address,
  tokenOut: address,
  amountIn: z.string().regex(/^[1-9]\d*$/),
  amountOut: z.string().regex(/^[1-9]\d{0,77}$/),
  minimumAmountOut: z.string().regex(/^[1-9]\d{0,77}$/),
  slippageBps: z.number().int().min(10).max(300),
  routing: z.literal("CLASSIC"),
  routerVersion: z.literal("2.1.2"),
  requestId: z.string().min(1).max(256),
  quotedAt: z.string(),
  source: z.literal("uniswap-trading-api"),
});

export class DexApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "DexApiError";
  }
}

export function isStale(observedAt: string, now = Date.now(), maxAgeMs = 120_000): boolean {
  const observed = Date.parse(observedAt);
  return !Number.isFinite(observed) || observed > now + 10_000 || now - observed > maxAgeMs;
}

export function createDexApi(
  baseUrl = process.env.DEX_API_URL ?? "http://127.0.0.1:3021",
  fetcher: typeof fetch = fetch,
) {
  async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(new URL(path, baseUrl), {
        cache: "no-store",
        ...init,
        headers: { Accept: "application/json", ...init?.headers },
      });
    } catch {
      throw new DexApiError("DEX API is unavailable", 503);
    }
    if (!response.ok) {
      throw new DexApiError(response.status === 404 ? "Pool not found" : "DEX API is unavailable", response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DexApiError("Invalid DEX API response", 502);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new DexApiError("Invalid DEX API response", 502);
    return parsed.data;
  }

  return {
    async getTokens(): Promise<TokenRecord[]> {
      return (await request("/api/v1/tokens", tokensResponseSchema)).tokens;
    },
    async getPools(): Promise<PoolRecord[]> {
      return (await request("/api/v1/pools", z.object({ pools: z.array(poolSchema) }))).pools;
    },
    async getPool(id: string): Promise<PoolRecord> {
      let identity: ReturnType<typeof parsePoolKey>;
      try {
        identity = parsePoolKey(id);
      } catch {
        throw new DexApiError("Invalid pool ID", 400);
      }
      const key = poolKey(identity.chainId, identity.protocol, identity.reference);
      const body = await request(`/api/v1/pools/${encodeURIComponent(key)}`, z.object({ pool: poolSchema }));
      if (body.pool.id !== key) throw new DexApiError("Invalid DEX API response", 502);
      return body.pool;
    },
    async getQuote(intent: SwapIntent, now = Date.now()): Promise<SwapQuote> {
      const query = new URLSearchParams({
        chainId: String(intent.chainId),
        tokenIn: intent.tokenIn,
        amountIn: intent.amountIn,
      });
      const body = await request(`/api/v1/quote?${query}`, z.object({ quote: quoteSchema }));
      try {
        validateSwapQuote(body.quote, intent, now);
      } catch (error) {
        if (error instanceof Error && error.message.includes("expired")) throw new DexApiError("Quote expired", 409);
        throw new DexApiError("Invalid DEX API response", 502);
      }
      return body.quote;
    },
    async getTradingQuote(intent: TradingIntent, now = Date.now()): Promise<{ quote: TradingQuoteSummary; quoteId: string }> {
      try {
        validateTradingIntent(intent);
      } catch {
        throw new DexApiError("Invalid Trading API intent", 400);
      }
      const body = await request("/api/v1/trading-quote", z.object({ quote: tradingQuoteSchema, quoteId: z.string().regex(/^[0-9a-f]{48}$/) }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      try {
        validateTradingQuoteSummary(body.quote, intent, now);
      } catch (error) {
        if (error instanceof Error && error.message.includes("expired")) throw new DexApiError("Quote expired", 409);
        throw new DexApiError("Invalid DEX API response", 502);
      }
      return body;
    },
  };
}
