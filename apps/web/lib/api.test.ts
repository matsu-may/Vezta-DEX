import { describe, expect, it } from "vitest";
import { TOKENS, poolKey } from "@vezta-dex/core";
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
});
