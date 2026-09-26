import { describe, expect, it } from "vitest";
import { TOKENS, poolKey, type Address } from "@vezta-dex/core";
import { PoolReader, type PoolChainSource } from "./pools";
import { handleRequest } from "./server";
import { QuoteReader } from "./quote";
import { TradingApiQuoteReader } from "./trading-api";

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
    const trading = new TradingApiQuoteReader("test-key", async () => Response.json({
      requestId: "request-1",
      routing: "CLASSIC",
      quote: {
        input: { token: TOKENS.USDC.address, amount: "100000000" },
        output: { token: TOKENS.WETH.address, amount: "100000000000000000", minimumAmount: "99500000000000000", recipient: "0x1111111111111111111111111111111111111111" },
      },
    }));
    const body = { chainId: 137, swapper: "0x1111111111111111111111111111111111111111", tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "100000000", slippageBps: 50 };
    const valid = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify(body) }), reader, quotes, trading);
    expect(valid.status).toBe(200);
    expect((await valid.json()).quote).toMatchObject({ routing: "CLASSIC", source: "uniswap-trading-api" });
    const invalid = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify({ ...body, tokenIn: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" }) }), reader, quotes, trading);
    expect(invalid.status).toBe(400);
    const unavailable = await handleRequest(new Request("http://localhost/api/v1/trading-quote", { method: "POST", body: JSON.stringify(body) }), reader, quotes);
    expect(unavailable.status).toBe(503);
  });
});
