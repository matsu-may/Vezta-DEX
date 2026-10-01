import { afterEach, describe, expect, it, vi } from "vitest";
import { TESTNET_SWAP_POLICY as P, buildTestnetSwapTransaction } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_HASH, TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

afterEach(() => vi.useRealTimers());
function setup() {
  const source = testnetQuoteSource(); let now = TESTNET_NOW;
  const reader = new TestnetSwapQuoteReader(() => source, undefined, () => now);
  return { source, reader, advance: (ms: number) => { now += ms; } };
}

describe("wallet-bound pinned testnet quotes", () => {
  it.each([false, true])("qualifies either direction at one block without funds or signing (%s)", async reverse => {
    const { source, reader } = setup();
    const code = vi.spyOn(source, "getCode");
    const quote = vi.spyOn(source, "quoteExactInput");
    const result = await reader.read(testnetIntent(reverse));
    expect(result.quoteId).toMatch(/^[a-f0-9]{48}$/);
    expect(result.quote).toMatchObject({ chainId: 84532, pool: P.pool, feeTier: 3000,
      blockNumber: "123", blockHash: TESTNET_HASH, source: "base-sepolia-rpc" });
    expect(result.qualification).toEqual({ configurationVerified: true, runtimeVerified: true, executionEnabled: false });
    expect(result.priceImpactBps).toBeGreaterThanOrEqual(0);
    expect(result.priceImpactBps).toBeLessThanOrEqual(100);
    expect(BigInt(result.quote.minimumAmountOut)).toBe(BigInt(result.quote.amountOut) * 9950n / 10000n);
    expect(buildTestnetSwapTransaction(result.quote, TESTNET_NOW).from).toBe(result.quote.wallet);
    expect(code.mock.calls.every(call => call[1] === 123n)).toBe(true);
    expect(quote.mock.calls[0]).toEqual([result.quote.tokenIn, result.quote.tokenOut,
      BigInt(result.quote.amountIn), 3000, 123n]);
    expect(code.mock.calls.some(call => call[0].toLowerCase() === result.quote.wallet.toLowerCase())).toBe(true);
  });

  it("rejects malformed intent before any RPC work", async () => {
    const source = testnetQuoteSource(); const create = vi.fn(() => source);
    const reader = new TestnetSwapQuoteReader(create, undefined, () => TESTNET_NOW);
    for (const patch of [{ chainId: 137 }, { amountIn: "2" }, { wallet: P.router },
      { slippageBps: 100 }, { secret: "injected" }]) {
      await expect(reader.read({ ...testnetIntent(), ...patch })).rejects.toMatchObject({ code: "TESTNET_INTENT_INVALID" });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks every changed dependency runtime before quoting or saving any quote", async () => {
    for (const address of [P.router, P.pool, "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
      "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2"]) {
      const { source, reader } = setup(); const original = source.getCode; let quoted = false;
      source.getCode = async (a, block) => a.toLowerCase() === address.toLowerCase() ? "0x6000" : original(a, block);
      const originalQuote = source.quoteExactInput;
      source.quoteExactInput = async (...args) => { quoted = true; return originalQuote(...args); };
      await expect(reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_RUNTIME_MISMATCH" });
      expect(quoted).toBe(false); expect(reader.store.size).toBe(0);
    }
  });

  it("fails closed on chain, code, decimals, dependencies, pool and non-EOA", async () => {
    const mutations = [
      (s: ReturnType<typeof testnetQuoteSource>) => { s.getChainId = async () => 137; },
      (s: ReturnType<typeof testnetQuoteSource>) => { s.getCode = async () => "0x"; },
      (s: ReturnType<typeof testnetQuoteSource>) => { s.getDecimals = async () => 18; },
      (s: ReturnType<typeof testnetQuoteSource>) => { s.getPool = async () => P.router; },
      (s: ReturnType<typeof testnetQuoteSource>) => { s.getTickSpacing = async () => 10; },
      (s: ReturnType<typeof testnetQuoteSource>) => { const read = s.getPoolState; s.getPoolState = async (...a) => ({ ...await read(...a), liquidity: 0n }); },
      (s: ReturnType<typeof testnetQuoteSource>) => { const read = s.getDependencyConfiguration; s.getDependencyConfiguration = async (...a) => {
        const c = await read(...a); c.router.factory = P.router; return c;
      }; },
      (s: ReturnType<typeof testnetQuoteSource>) => { const read = s.getCode; s.getCode = async (address, block) =>
        address.toLowerCase() === testnetIntent().wallet.toLowerCase() ? "0x6000" : read(address, block); },
    ];
    for (const mutate of mutations) {
      const { source, reader } = setup(); mutate(source);
      await expect(reader.read(testnetIntent())).rejects.toThrow();
    }
  });

  it("rejects stale, future, reorg and late completed quotes against the original block", async () => {
    for (const timestamp of [1790799972n, 1790800013n]) {
      const { source, reader } = setup(); source.getLatestBlock = async () => ({ number: 123n, timestamp, hash: TESTNET_HASH });
      await expect(reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_QUOTE_STALE" });
    }
    const changed = setup(); changed.source.getBlockHash = async () => `0x${"cd".repeat(32)}`;
    await expect(changed.reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_BLOCK_CHANGED" });
    const slow = setup(); const original = slow.source.quoteExactInput;
    slow.source.quoteExactInput = async (...args) => { slow.advance(28000); return original(...args); };
    await expect(slow.reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_QUOTE_STALE" });
  });

  it("rejects excessive impact, limit exhaustion, impossible price movement and unavailable quote", async () => {
    for (const patch of [{ amountOut: 1n }, { amountOut: 2n ** 256n }, { sqrtPriceX96After: 4295128740n },
      { sqrtPriceX96After: 2n ** 96n * 20000n + 1n }, { gasEstimate: 0n }, { initializedTicksCrossed: -1 }]) {
      const { source, reader } = setup(); const original = source.quoteExactInput;
      source.quoteExactInput = async (...args) => ({ ...await original(...args), ...patch });
      await expect(reader.read(testnetIntent())).rejects.toThrow();
    }
    const { source, reader } = setup(); source.quoteExactInput = async () => { throw new Error("private provider key"); };
    await expect(reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_RPC_UNAVAILABLE" });
  });

  it("aborts at 25 seconds, rejects busy requests and never stores a late result", async () => {
    vi.useFakeTimers();
    let finish!: (value: number) => void;
    const source = testnetQuoteSource(); source.getChainId = () => new Promise(resolve => { finish = resolve; });
    const signals: AbortSignal[] = [];
    const reader = new TestnetSwapQuoteReader(signal => { signals.push(signal); return source; }, undefined, () => TESTNET_NOW);
    const pending = expect(reader.read(testnetIntent())).rejects.toMatchObject({ code: "TESTNET_QUOTE_TIMEOUT" });
    await expect(reader.read(testnetIntent(true))).rejects.toMatchObject({ code: "TESTNET_QUOTE_BUSY" });
    await vi.advanceTimersByTimeAsync(25000); await pending;
    expect(signals[0].aborted).toBe(true);
    finish(84532); await vi.advanceTimersByTimeAsync(1);
    expect(reader.store.size).toBe(0);
    source.getChainId = async () => 84532;
    expect((await reader.read(testnetIntent())).quoteId).toHaveLength(48);
  });
});
