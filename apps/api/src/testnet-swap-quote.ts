import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, parseTestnetSwapIntent,
  parseTestnetSwapQuote, TESTNET_DIRECT_POOLS, testnetDirectPool, type Address, type TestnetSwapIntent } from "@vezta-dex/core";
import type { BaseSepoliaDepthSource } from "./base-sepolia-depth";
import { TestnetQuoteStore } from "./testnet-quote-store";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";

export interface BaseSepoliaSwapSource extends BaseSepoliaDepthSource {
  getTickSpacing(pool: Address, blockNumber: bigint): Promise<number>;
  getDependencyConfiguration(blockNumber: bigint): Promise<{
    router: { factory: Address; weth: Address; positionManager: Address };
    quoter: { factory: Address; weth: Address };
    manager: { factory: Address; weth: Address };
  }>;
}
type QuoteErrorCode = "TESTNET_INTENT_INVALID" | "TESTNET_QUOTE_BUSY" | "TESTNET_QUOTE_TIMEOUT"
  | "TESTNET_RPC_UNAVAILABLE" | "TESTNET_WRONG_CHAIN" | "TESTNET_QUOTE_STALE"
  | "TESTNET_CONFIGURATION_INVALID" | "TESTNET_EOA_REQUIRED" | "TESTNET_BLOCK_CHANGED"
  | "TESTNET_QUOTE_INVALID" | "TESTNET_IMPACT_EXCEEDED" | "TESTNET_RUNTIME_MISMATCH";
export class TestnetQuoteError extends Error {
  constructor(readonly code: QuoteErrorCode) { super(code); }
}
const MIN_SQRT = 4295128739n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
const Q192 = 2n ** 192n;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hasCode = (code: string) => /^0x(?:[0-9a-fA-F]{2})+$/.test(code);
const fail = (code: QuoteErrorCode): never => { throw new TestnetQuoteError(code); };

export class TestnetSwapQuoteReader {
  private busy = false;
  readonly store: TestnetQuoteStore;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaSwapSource,
    store?: TestnetQuoteStore, private readonly now = Date.now) {
    this.store = store ?? new TestnetQuoteStore(now);
  }

  async read(value: unknown) {
    let intent: TestnetSwapIntent;
    try { intent = parseTestnetSwapIntent(value); } catch { return fail("TESTNET_INTENT_INVALID"); }
    if (this.busy) return fail("TESTNET_QUOTE_BUSY");
    this.busy = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetQuoteError("TESTNET_QUOTE_TIMEOUT")); }, 25000);
      });
      const work = this.probe(this.createSource(controller.signal), intent, controller.signal);
      const result = await Promise.race([work, timeout]);
      // Store only the winner: late provider work cannot publish a quote after timeout.
      const quoteId = this.store.save(result.quote);
      return { ...result, quoteId };
    } catch (error) {
      if (error instanceof TestnetQuoteError) throw error;
      return fail("TESTNET_RPC_UNAVAILABLE");
    } finally {
      clearTimeout(timer); controller.abort(); this.busy = false;
    }
  }

  private async probe(source: BaseSepoliaSwapSource, i: TestnetSwapIntent, signal: AbortSignal) {
    if (await source.getChainId() !== P.chainId) return fail("TESTNET_WRONG_CHAIN");
    signal.throwIfAborted();
    const block = await source.getLatestBlock();
    const freshness = () => {
      const now = this.now();
      const observed = Number(block.timestamp) * 1000;
      if (!Number.isSafeInteger(now) || now < 0 || block.number <= 0n || !Number.isSafeInteger(observed)
        || observed <= 0 || observed > now + 10000 || now - observed >= 30000
        || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || BigInt(block.hash) === 0n) return fail("TESTNET_QUOTE_STALE");
      signal.throwIfAborted();
    };
    freshness();
    const addresses = [C.USDC.address, C.WETH.address, C.v3Factory, C.v3QuoterV2,
      C.v3PositionManager, P.router];
    const [codes, usdcDecimals, wethDecimals, deps, walletCode] = await Promise.all([
      Promise.all(addresses.map(address => source.getCode(address, block.number))),
      source.getDecimals(C.USDC.address, block.number), source.getDecimals(C.WETH.address, block.number),
      source.getDependencyConfiguration(block.number),
      source.getCode(i.wallet, block.number),
    ]);
    freshness();
    if (!codes.every(hasCode) || usdcDecimals !== 6 || wethDecimals !== 18
      || ![deps.router, deps.quoter, deps.manager].every(d => same(d.factory, C.v3Factory) && same(d.weth, C.WETH.address))
      || !same(deps.router.positionManager, C.v3PositionManager)) return fail("TESTNET_CONFIGURATION_INVALID");
    let walletKind: ReturnType<typeof classifyTestnetWalletCode>;
    try { walletKind = classifyTestnetWalletCode(walletCode); } catch { return fail("TESTNET_EOA_REQUIRED"); }
    if (walletKind === "metamask-delegated") {
      try { await verifyTestnetMetaMaskRuntime(source, block.number); } catch { return fail("TESTNET_RUNTIME_MISMATCH"); }
      freshness();
    }
    const candidates = i.routing === "best-direct" ? TESTNET_DIRECT_POOLS : [testnetDirectPool(i.poolFeeTier ?? P.feeTier)];
    const probePool = async (selected: typeof TESTNET_DIRECT_POOLS[number]) => {
      const [code, pool, state, spacing] = await Promise.all([
        source.getCode(selected.pool, block.number), source.getPool(selected.feeTier, block.number),
        source.getPoolState(selected.pool, block.number), source.getTickSpacing(selected.pool, block.number),
      ]);
      freshness();
      try { verifyTestnetRuntimeCodes(P.chainId, [
        ...addresses.slice(2).map((address, index) => ({ address, code: codes[index + 2] })),
        { address: selected.pool, code },
      ], selected.feeTier); } catch { return fail("TESTNET_RUNTIME_MISMATCH"); }
      if (!same(pool, selected.pool) || !same(state.token0, C.USDC.address) || !same(state.token1, C.WETH.address)
        || !same(state.factory, C.v3Factory) || state.fee !== selected.feeTier || spacing !== selected.tickSpacing
        || state.liquidity <= 0n || state.liquidity >= 2n ** 128n
        || state.sqrtPriceX96 <= MIN_SQRT || state.sqrtPriceX96 >= MAX_SQRT) return fail("TESTNET_CONFIGURATION_INVALID");
    const q = await source.quoteExactInput(i.tokenIn, i.tokenOut, BigInt(i.amountIn), selected.feeTier, block.number);
    freshness();
    const forward = same(i.tokenIn, C.USDC.address);
    const ratio = state.sqrtPriceX96 ** 2n;
    const spot = BigInt(i.amountIn) * BigInt(1000000 - selected.feeTier) * (forward ? ratio : Q192)
      / (1000000n * (forward ? Q192 : ratio));
    if (spot <= 0n || q.amountOut <= 0n || q.amountOut > spot || q.amountOut >= 2n ** 256n
      || q.gasEstimate <= 0n || q.gasEstimate >= 2n ** 256n
      || q.sqrtPriceX96After <= MIN_SQRT + 1n || q.sqrtPriceX96After >= MAX_SQRT - 1n
      || (forward ? q.sqrtPriceX96After > state.sqrtPriceX96 : q.sqrtPriceX96After < state.sqrtPriceX96)
      || !Number.isInteger(q.initializedTicksCrossed) || q.initializedTicksCrossed < 0
      || q.initializedTicksCrossed > 1774544) return fail("TESTNET_QUOTE_INVALID");
    const impact = Number(((spot - q.amountOut) * 10000n + spot - 1n) / spot);
    if (impact > 100) return fail("TESTNET_IMPACT_EXCEEDED");
      return { selected, q, impact };
    };
    const results = await Promise.allSettled(candidates.map(probePool));
    freshness();
    const qualified = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
    if (!qualified.length) {
      if (candidates.length === 1 && results[0].status === "rejected") throw results[0].reason;
      return fail("TESTNET_QUOTE_INVALID");
    }
    qualified.sort((a,b) => a.q.amountOut > b.q.amountOut ? -1 : a.q.amountOut < b.q.amountOut ? 1 : a.selected.feeTier - b.selected.feeTier);
    const { selected, q, impact } = qualified[0];
    if (!same(await source.getBlockHash(block.number), block.hash)) return fail("TESTNET_BLOCK_CHANGED");
    freshness();
    const quote = parseTestnetSwapQuote({ ...i, protocol: "v3", pool: selected.pool, feeTier: selected.feeTier, quoteTtlSeconds: P.demoQuoteTtlSeconds,
      amountOut: q.amountOut.toString(), minimumAmountOut: (q.amountOut * BigInt(10000 - i.slippageBps) / 10000n).toString(),
      blockNumber: block.number.toString(), blockHash: block.hash,
      observedAt: new Date(Number(block.timestamp) * 1000).toISOString(), source: "base-sepolia-rpc" }, this.now());
    return { quote, priceImpactBps: impact,
      ...(i.routing === "best-direct" ? { comparison: { attemptedPoolCount: candidates.length, qualifiedPoolCount: qualified.length,
        candidates: results.map((r, index) => r.status === "fulfilled"
          ? { feeTier: candidates[index].feeTier, status: "qualified" as const, amountOut: r.value.q.amountOut.toString(), priceImpactBps: r.value.impact }
          : { feeTier: candidates[index].feeTier, status: "unavailable" as const }) } } : {}),
      qualification: { configurationVerified: true, runtimeVerified: true, executionEnabled: false } as const };
  }
}
import { classifyTestnetWalletCode } from "@vezta-dex/core";
import { verifyTestnetMetaMaskRuntime } from "./testnet-metamask-runtime";
