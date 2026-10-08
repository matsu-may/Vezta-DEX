import { describe, expect, it } from "vitest";
import { TOKENS, poolKey, type Address } from "@vezta-dex/core";
import { PoolReader, type PoolChainSource } from "../modules/discovery/pools";
import { handleRequest } from "./server";
import { QuoteReader } from "../modules/swap/quote";
import { TradingApiQuoteReader } from "../modules/swap/trading-api";
import { TradingApiClient } from "../modules/swap/trading-client";
import { AllowanceReader } from "../modules/swap/allowance-reader";

const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9" as Address;
const chain: PoolChainSource = {
  getBlock: async () => ({ number: 94497119n, timestamp: 1790450819n }),
  getPoolAddress: async (fee) => fee === 500 ? POOL : "0x0000000000000000000000000000000000000000",
  getPoolState: async () => ({ token0: TOKENS.USDC.address, token1: TOKENS.WETH.address, liquidity: 10n }),
};
const reader = new PoolReader(chain);
const quotes = new QuoteReader({
  getBlock: chain.getBlock,
  getPoolAddress: async () => POOL,
  quoteExactInput: async () => ({ amountOut: 37220700433119377n, gasEstimate: 117644n }),
});

describe("DEX HTTP handler", () => {
  it("keeps process liveness separate from Polygon readiness", async () => {
    const healthy = await handleRequest(new Request("http://localhost/health"), reader);
    expect(await healthy.json()).toEqual({ status: "ok" });
    const ready = await handleRequest(new Request("http://localhost/ready"), reader, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { check: async () => ({ status: "ready" as const, polygon: "ok" as const }) });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready", polygon: "ok" });
    const unavailable = await handleRequest(new Request("http://localhost/ready"), reader, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { check: async () => ({ status: "unavailable" as const, polygon: "unavailable" as const }) });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "unavailable", polygon: "unavailable" });
  });
  it("serves a bounded read-only LP position page and rejects malformed pagination", async () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const positions = { getPage: async () => ({ chainId: 137, positions: [], nextCursor: null, incomplete: false }) };
    const url = `http://localhost/api/v1/lp/positions?chainId=137&owner=${owner}&cursor=0&limit=5`;
    const valid = await handleRequest(new Request(url), reader, undefined, undefined, undefined, undefined, undefined, undefined, undefined, positions);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ page: { chainId: 137, positions: [], nextCursor: null, incomplete: false } });
    expect(valid.headers.get("Cache-Control")).toBe("no-store");
    const invalid = await handleRequest(new Request(url.replace("limit=5", "limit=6")), reader, undefined, undefined, undefined, undefined, undefined, undefined, undefined, positions);
    expect(invalid.status).toBe(400);
    const missing = await handleRequest(new Request(url), reader);
    expect(missing.status).toBe(503);
  });
  it("serves curated tokens without an RPC call", async () => {
    const response = await handleRequest(new Request("http://localhost/api/v1/tokens"), reader);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tokens).toHaveLength(2);
    expect(body.tokens[0].address).toBe(TOKENS.USDC.address);
  });

  it("serves a pool by chain-aware key", async () => {
    const key = poolKey(137, "v3", POOL);
    const response = await handleRequest(new Request("http://localhost/api/v1/pools/" + encodeURIComponent(key)), reader);
    expect(response.status).toBe(200);
    expect((await response.json()).pool.id).toBe(key);
  });

  it("returns 400 for a wrong-chain pool key", async () => {
    const response = await handleRequest(new Request("http://localhost/api/v1/pools/1:v3:" + POOL), reader);
    expect(response.status).toBe(400);
  });

  it("returns 503 when the chain provider fails", async () => {
    const broken = new PoolReader({ ...chain, getBlock: async () => { throw new Error("secret RPC URL"); } });
    const response = await handleRequest(new Request("http://localhost/api/v1/pools"), broken);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret RPC URL");
  });

  it("returns a fixed-pool exact-input quote and rejects bridged USDC", async () => {
    const valid = await handleRequest(new Request(`http://localhost/api/v1/quote?chainId=137&tokenIn=${TOKENS.USDC.address}&amountIn=100000000`), reader, quotes);
    expect(valid.status).toBe(200);
    expect((await valid.json()).quote.amountOut).toBe("37220700433119377");
    const invalid = await handleRequest(new Request("http://localhost/api/v1/quote?chainId=137&tokenIn=0x2791bca1f2de4661ed88a30c99a7a9449aa84174&amountIn=100000000"), reader, quotes);
    expect(invalid.status).toBe(400);
  });

  it("serves a wallet-bound Trading API quote without exposing upstream details", async () => {
    const trading = new TradingApiQuoteReader(new TradingApiClient("test-key", async () => Response.json({
      requestId: "request-1",
      routing: "CLASSIC",
      quote: {
        chainId: 137,
        tradeType: "EXACT_INPUT",
        txFailureReasons: [],
        route: [[{
          type: "v3-pool", address: POOL,
          tokenIn: { chainId: 137, address: TOKENS.USDC.address },
          tokenOut: { chainId: 137, address: TOKENS.WETH.address },
        }]],
        swapper: "0x1111111111111111111111111111111111111111",
        input: { token: TOKENS.USDC.address, amount: "100000000" },
        output: { token: TOKENS.WETH.address, amount: "100000000000000000", minimumAmount: "99500000000000000", recipient: "0x1111111111111111111111111111111111111111" },
      },
    })));
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "100000000", slippageBps: 50 };
    const valid = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify(body) }), reader, quotes, trading);
    expect(valid.status).toBe(200);
    const result = await valid.json();
    expect(result.quote).toMatchObject({ routing: "CLASSIC", source: "uniswap-trading-api" });
    expect(result.quoteId).toMatch(/^[0-9a-f]{48}$/);
    expect(result).not.toHaveProperty("permitData");
    const invalid = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify({ ...body, tokenIn: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" }) }), reader, quotes, trading);
    expect(invalid.status).toBe(400);
    const unavailable = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify(body) }), reader, quotes);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Trading API is not configured", code: "TRADING_API_NOT_CONFIGURED" });
  });

  it("hides the key and upstream body when Uniswap rate-limits a quote", async () => {
    const trading = new TradingApiQuoteReader(new TradingApiClient("test-secret-key", async () => new Response("private upstream detail", { status: 429 })));
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "100000000", slippageBps: 50 };
    const response = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify(body) }), reader, quotes, trading);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Trading API quote is unavailable", code: "TRADING_API_RATE_LIMITED", upstreamStatus: 429 });
    expect(text).not.toContain("test-secret-key");
    expect(text).not.toContain("private upstream detail");
  });

  it("returns only an exact unsigned approval plan from a pinned Polygon allowance", async () => {
    const approval = new AllowanceReader({
      getBlock: async () => ({ number: 123n, timestamp: 1_000n }),
      getAccountCode: async () => "0x",
      getTokenAllowance: async () => 0n,
    }, () => 1_000_000);
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
    const valid = await handleRequest(new Request("http://localhost/api/v1/approval-plan", { method: "POST", body: JSON.stringify(body) }), reader, quotes, undefined, approval);
    expect(valid.status).toBe(200);
    expect(valid.headers.get("Cache-Control")).toBe("no-store");
    const result = await valid.json();
    expect(result.approval.plan.kind).toBe("approve");
    expect(result.approval.plan.transaction.data).toContain("000000000022d473030f116ddee9f6b43ac78ba3");
    expect(result.approval.plan.transaction.data).not.toContain("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const invalid = await handleRequest(new Request("http://localhost/api/v1/approval-plan", { method: "POST", body: JSON.stringify({ ...body, chainId: 1 }) }), reader, quotes, undefined, approval);
    expect(invalid.status).toBe(400);
  });

  it("blocks existing excessive allowance and hides RPC failures", async () => {
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
    const request = () => new Request("http://localhost/api/v1/approval-plan", { method: "POST", body: JSON.stringify(body) });
    const existing = new AllowanceReader({ getBlock: async () => ({ number: 123n, timestamp: 1_000n }), getAccountCode: async () => "0x", getTokenAllowance: async () => (1n << 256n) - 1n }, () => 1_000_000);
    const blocked = await handleRequest(request(), reader, quotes, undefined, existing);
    expect(blocked.status).toBe(200);
    const result = await blocked.json();
    expect(result.approval.plan.kind).toBe("blocked-existing");
    expect(result.approval.plan.transaction).toBeUndefined();
    const broken = new AllowanceReader({ getBlock: async () => { throw new Error("secret RPC URL"); }, getAccountCode: async () => "0x", getTokenAllowance: async () => 0n });
    const unavailable = await handleRequest(request(), reader, quotes, undefined, broken);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("secret RPC URL");
  });

  it("returns blocked-account approval without calldata or raw account code", async () => {
    const approval = new AllowanceReader({
      getBlock: async () => ({ number: 123n, timestamp: 1_000n }),
      getAccountCode: async () => "0x6000",
      getTokenAllowance: async () => { throw new Error("Allowance read must not happen for blocked account"); },
    }, () => 1_000_000);
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
    const response = await handleRequest(new Request("http://localhost/api/v1/approval-plan", { method: "POST", body: JSON.stringify(body) }), reader, quotes, undefined, approval);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json();
    expect(result.approval).toMatchObject({ currentAllowance: null, plan: { kind: "blocked-account" } });
    expect(result.approval.plan.transaction).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("0x6000");
  });

  it("hides account-code RPC failure instead of preparing an approval", async () => {
    const approval = new AllowanceReader({
      getBlock: async () => ({ number: 123n, timestamp: 1_000n }),
      getAccountCode: async () => { throw new Error("secret account-code endpoint"); },
      getTokenAllowance: async () => 0n,
    }, () => 1_000_000);
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 };
    const response = await handleRequest(new Request("http://localhost/api/v1/approval-plan", { method: "POST", body: JSON.stringify(body) }), reader, quotes, undefined, approval);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Polygon approval state is unavailable" });
  });
});
