import { describe, expect, it } from "vitest";
import { TOKENS, V3_POOL_500, type Address } from "@vezta-dex/core";
import { QuoteReader, type QuoteChainSource } from "./quote";

function source(overrides: Partial<QuoteChainSource> = {}): QuoteChainSource {
  return {
    getBlock: async () => ({ number: 94497119n, timestamp: 1790450819n }),
    getPoolAddress: async () => V3_POOL_500,
    quoteExactInput: async () => ({ amountOut: 37220700433119377n, gasEstimate: 117644n }),
    ...overrides,
  };
}

describe("QuoteReader", () => {
  it("quotes native USDC to WETH at one Polygon block", async () => {
    const quote = await new QuoteReader(source()).getQuote({ chainId: 137, tokenIn: TOKENS.USDC.address, amountIn: "100000000" });
    expect(quote).toMatchObject({
      chainId: 137,
      pool: V3_POOL_500,
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.WETH.address,
      feeTier: 500,
      amountIn: "100000000",
      amountOut: "37220700433119377",
      quoterGasEstimate: "117644",
      blockNumber: "94497119",
      observedAt: "2026-09-26T19:26:59.000Z",
    });
  });

  it("supports the reverse direction without choosing tokens by symbol", async () => {
    const quote = await new QuoteReader(source()).getQuote({ chainId: 137, tokenIn: TOKENS.WETH.address, amountIn: "1000000000000000000" });
    expect(quote.tokenOut).toBe(TOKENS.USDC.address);
  });

  it("rejects an unknown token and excessive amount before RPC", async () => {
    let calls = 0;
    const reader = new QuoteReader(source({ getBlock: async () => { calls++; throw new Error("should not call"); } }));
    await expect(reader.getQuote({ chainId: 137, tokenIn: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" as Address, amountIn: "1000000" })).rejects.toThrow();
    await expect(reader.getQuote({ chainId: 137, tokenIn: TOKENS.USDC.address, amountIn: "10000000001" })).rejects.toThrow();
    await expect(reader.getQuote({ chainId: 137, tokenIn: TOKENS.WETH.address, amountIn: "9".repeat(10_000) })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("rejects a different factory pool and a zero output", async () => {
    await expect(new QuoteReader(source({ getPoolAddress: async () => "0x1111111111111111111111111111111111111111" })).getQuote({ chainId: 137, tokenIn: TOKENS.USDC.address, amountIn: "100000000" })).rejects.toThrow("Pool identity");
    await expect(new QuoteReader(source({ quoteExactInput: async () => ({ amountOut: 0n, gasEstimate: 0n }) })).getQuote({ chainId: 137, tokenIn: TOKENS.USDC.address, amountIn: "100000000" })).rejects.toThrow("No executable quote");
  });
});
