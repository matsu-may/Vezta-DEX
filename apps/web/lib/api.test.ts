import { describe, expect, it } from "vitest";
import { TOKENS, V3_POOL_500, poolKey } from "@vezta-dex/core";
import { createDexApi, isStale, DexApiError } from "./api";

const pool = {
  id: poolKey(137, "v3", "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9"),
  chainId: 137,
  protocol: "v3",
  reference: "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9",
  token0: TOKENS.USDC,
  token1: TOKENS.WETH,
  feeTier: 500,
  activeLiquidity: "40754944770195441",
  tvlUsd: null,
  volume24hUsd: null,
  source: "polygon-rpc",
  observedAt: "2026-09-26T19:26:59.000Z",
  blockNumber: "94497119",
};

describe("DEX API client", () => {
  it("parses pool responses and preserves source metadata", async () => {
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ pools: [pool] }));
    expect(await api.getPools()).toEqual([pool]);
  });

  it("rejects malformed pool data instead of displaying invented metrics", async () => {
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ pools: [{ ...pool, tvlUsd: "1000000" }] }));
    await expect(api.getPools()).rejects.toThrow("Invalid DEX API response");
  });

  it("rejects a lookalike token address in a pool response", async () => {
    const fakeUsdc = { ...TOKENS.USDC, address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" };
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ pools: [{ ...pool, token0: fakeUsdc }] }));
    await expect(api.getPools()).rejects.toThrow("Invalid DEX API response");
  });

  it("rejects a lookalike curated token list", async () => {
    const fakeUsdc = { ...TOKENS.USDC, address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" };
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ tokens: [fakeUsdc, TOKENS.WETH] }));
    await expect(api.getTokens()).rejects.toThrow("Invalid DEX API response");
  });

  it("preserves 404 and 503 as distinct controlled errors", async () => {
    const missing = createDexApi("http://127.0.0.1:3021", async () => Response.json({ error: "Pool not found" }, { status: 404 }));
    const unavailable = createDexApi("http://127.0.0.1:3021", async () => Response.json({ error: "Unavailable" }, { status: 503 }));
    await expect(missing.getPool(pool.id)).rejects.toMatchObject({ status: 404 });
    await expect(unavailable.getPools()).rejects.toBeInstanceOf(DexApiError);
  });

  it("marks old and invalid observations stale", () => {
    const now = Date.parse("2026-09-26T19:30:00.000Z");
    expect(isStale("2026-09-26T19:29:00.000Z", now)).toBe(false);
    expect(isStale("2026-09-26T19:26:59.000Z", now)).toBe(true);
    expect(isStale("bad timestamp", now)).toBe(true);
  });

  it("accepts a fresh quote for the exact amount and rejects a changed amount", async () => {
    const quote = {
      chainId: 137, protocol: "v3", pool: V3_POOL_500, feeTier: 500,
      tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address,
      amountIn: "100000000", amountOut: "37220700433119377", quoterGasEstimate: "117644",
      blockNumber: "94497119", observedAt: "2026-09-26T19:26:59.000Z", source: "polygon-rpc",
    };
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ quote }));
    const intent = { chainId: 137, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "100000000", slippageBps: 50 };
    expect((await api.getQuote(intent, Date.parse("2026-09-26T19:27:10.000Z"))).amountOut).toBe(quote.amountOut);
    await expect(api.getQuote({ ...intent, amountIn: "200000000" }, Date.parse("2026-09-26T19:27:10.000Z"))).rejects.toThrow("Invalid DEX API response");
  });

  it("validates a wallet-bound Trading API quote from the DEX server", async () => {
    const intent = {
      chainId: 137,
      swapper: "0x1111111111111111111111111111111111111111" as const,
      tokenIn: TOKENS.USDC.address,
      tokenOut: TOKENS.WETH.address,
      amountIn: "100000000",
      slippageBps: 50,
    };
    const quote = {
      ...intent,
      amountOut: "100000000000000000",
      minimumAmountOut: "99500000000000000",
      routing: "CLASSIC",
      routerVersion: "2.1.2",
      requestId: "request-1",
      quotedAt: "2026-09-27T00:00:00.000Z",
      source: "uniswap-trading-api",
    };
    const quoteId = "a".repeat(48);
    const api = createDexApi("http://127.0.0.1:3021", async () => Response.json({ quote, quoteId }));
    expect(await api.getTradingQuote(intent, Date.parse("2026-09-27T00:00:10.000Z"))).toMatchObject({ quote: { amountOut: quote.amountOut }, quoteId });
    await expect(api.getTradingQuote({ ...intent, swapper: "0x2222222222222222222222222222222222222222" }, Date.parse("2026-09-27T00:00:10.000Z"))).rejects.toThrow();
    const missingId = createDexApi("http://127.0.0.1:3021", async () => Response.json({ quote }));
    await expect(missingId.getTradingQuote(intent, Date.parse("2026-09-27T00:00:10.000Z"))).rejects.toThrow("Invalid DEX API response");
  });

  it("accepts a sparse LP owner page and preserves the cursor past unrelated NFTs", async () => {
    const owner = "0x1111111111111111111111111111111111111111" as const;
    const page = { chainId: 137, manager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      pool: V3_POOL_500, owner, source: "polygon-rpc", blockNumber: "94738685",
      observedAt: "2026-10-01T00:00:00.000Z", totalOwned: "7", nextCursor: "5", incomplete: true, positions: [] };
    const api = createDexApi("http://127.0.0.1:3021", async (input) => {
      expect(String(input)).toContain(`/api/v1/lp/positions?chainId=137&owner=${owner}&cursor=0&limit=5`);
      return Response.json(page);
    });
    expect(await api.getPositionPage(owner)).toEqual(page);
  });

  it("rejects LP pages with a changed owner, manager, dishonest amounts or a stalled cursor", async () => {
    const owner = "0x1111111111111111111111111111111111111111" as const;
    const page = { chainId: 137, manager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      pool: V3_POOL_500, owner, source: "polygon-rpc", blockNumber: "94738685",
      observedAt: "2026-10-01T00:00:00.000Z", totalOwned: "7", nextCursor: "5", incomplete: true,
      positions: [{ tokenId: "42", tickLower: -100, tickUpper: 100, inRange: true, liquidity: "123",
        currentAmounts: null, uncollectedFees: null }] };
    for (const altered of [
      { ...page, owner: TOKENS.WETH.address },
      { ...page, manager: TOKENS.WETH.address },
      { ...page, positions: [{ ...page.positions[0], currentAmounts: { USDC: "1" } }] },
      { ...page, nextCursor: "0" },
      { ...page, totalOwned: "0", nextCursor: "5" },
    ]) {
      const api = createDexApi("http://127.0.0.1:3021", async () => Response.json(altered));
      await expect(api.getPositionPage(owner)).rejects.toThrow("Invalid DEX API response");
    }
    const pastEnd = createDexApi("http://127.0.0.1:3021", async () => Response.json({ ...page, nextCursor: null, incomplete: false }));
    await expect(pastEnd.getPositionPage(owner, 8)).rejects.toThrow("Invalid DEX API response");
  });
});
