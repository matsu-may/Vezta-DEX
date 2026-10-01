import { BASE_SEPOLIA_CANDIDATE as C, type Address } from "@vezta-dex/core";
import { BaseSepoliaPreflightError, qualifyBaseSepoliaPools, type BaseSepoliaPreflightSource } from "./base-sepolia-preflight";

export interface BaseSepoliaDepthSource extends BaseSepoliaPreflightSource {
  quoteExactInput(tokenIn: Address, tokenOut: Address, amountIn: bigint, feeTier: number, blockNumber: bigint): Promise<{
    amountOut: bigint; sqrtPriceX96After: bigint; initializedTicksCrossed: number; gasEstimate: bigint;
  }>;
}

// Uniswap v3 TickMath bounds; QuoterV2's zero-limit defaults stop one unit inside them.
const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
const Q192 = 2n ** 192n;
const MAX_PRICE_IMPACT_BPS = 100;
const SIZES = [
  { direction: "USDC_TO_WETH", tokenIn: C.USDC.address, tokenOut: C.WETH.address,
    amounts: [100_000n, 1_000_000n, 5_000_000n] },
  { direction: "WETH_TO_USDC", tokenIn: C.WETH.address, tokenOut: C.USDC.address,
    amounts: [10_000_000_000_000n, 100_000_000_000_000n, 1_000_000_000_000_000n] },
] as const;

interface DepthSample {
  direction: "USDC_TO_WETH" | "WETH_TO_USDC";
  amountIn: string;
  available: boolean;
  amountOut: string | null;
  spotAmountOutAfterFee: string | null;
  priceImpactBps: number | null;
  quoterGasEstimate: string | null;
  initializedTicksCrossed: number | null;
  withinImpactLimit: boolean;
  code?: "QUOTE_UNAVAILABLE" | "QUOTE_INVALID";
}

function same(a: string, b: string): boolean { return a.toLowerCase() === b.toLowerCase(); }

export async function probeBaseSepoliaDepth(source: BaseSepoliaDepthSource, nowMs = Date.now()) {
  const preflight = await qualifyBaseSepoliaPools(source, nowMs);
  const blockNumber = BigInt(preflight.blockNumber);
  const pools: Array<{ address: Address; feeTier: number; depthQualified: boolean; samples: DepthSample[] }> = [];
  for (const pool of preflight.pools.filter(pool => pool.quoteAvailable)) {
    const state = await source.getPoolState(pool.address, blockNumber);
    if (!same(state.token0, C.USDC.address) || !same(state.token1, C.WETH.address)
      || !same(state.factory, C.v3Factory) || state.fee !== pool.feeTier || state.liquidity <= 0n
      || state.sqrtPriceX96 <= MIN_SQRT_RATIO || state.sqrtPriceX96 >= MAX_SQRT_RATIO) {
      throw new BaseSepoliaPreflightError("POOL_IDENTITY");
    }
    const ratio = state.sqrtPriceX96 ** 2n;
    const samples: DepthSample[] = [];
    for (const direction of SIZES) {
      for (const amountIn of direction.amounts) {
        const sample: DepthSample = { direction: direction.direction, amountIn: amountIn.toString(),
          available: false, amountOut: null, spotAmountOutAfterFee: null, priceImpactBps: null,
          quoterGasEstimate: null, initializedTicksCrossed: null, withinImpactLimit: false };
        let quote: Awaited<ReturnType<BaseSepoliaDepthSource["quoteExactInput"]>>;
        try {
          quote = await source.quoteExactInput(direction.tokenIn, direction.tokenOut, amountIn, pool.feeTier, blockNumber);
        } catch {
          samples.push({ ...sample, code: "QUOTE_UNAVAILABLE" });
          continue;
        }
        const forward = direction.direction === "USDC_TO_WETH";
        const marginalOutput = amountIn * BigInt(1_000_000 - pool.feeTier)
          * (forward ? ratio : Q192) / (1_000_000n * (forward ? Q192 : ratio));
        if (marginalOutput <= 0n || quote.amountOut <= 0n || quote.amountOut > marginalOutput
          || quote.gasEstimate <= 0n || quote.gasEstimate >= 2n ** 256n
          || quote.sqrtPriceX96After <= MIN_SQRT_RATIO + 1n || quote.sqrtPriceX96After >= MAX_SQRT_RATIO - 1n
          || (forward ? quote.sqrtPriceX96After > state.sqrtPriceX96 : quote.sqrtPriceX96After < state.sqrtPriceX96)
          || !Number.isInteger(quote.initializedTicksCrossed) || quote.initializedTicksCrossed < 0
          || quote.initializedTicksCrossed > 1_774_544) {
          samples.push({ ...sample, code: "QUOTE_INVALID" });
          continue;
        }
        const difference = marginalOutput - quote.amountOut;
        const priceImpactBps = Number((difference * 10_000n + marginalOutput - 1n) / marginalOutput);
        samples.push({ ...sample, available: true, amountOut: quote.amountOut.toString(),
          spotAmountOutAfterFee: marginalOutput.toString(), priceImpactBps,
          quoterGasEstimate: quote.gasEstimate.toString(), initializedTicksCrossed: quote.initializedTicksCrossed,
          withinImpactLimit: priceImpactBps <= MAX_PRICE_IMPACT_BPS });
      }
    }
    pools.push({ address: pool.address, feeTier: pool.feeTier,
      depthQualified: samples.length === 6 && samples.every(sample => sample.available && sample.withinImpactLimit), samples });
  }
  if (!same(await source.getBlockHash(blockNumber), preflight.blockHash)) {
    throw new BaseSepoliaPreflightError("BLOCK_CHANGED");
  }
  return { chainId: C.chainId, blockNumber: preflight.blockNumber, blockHash: preflight.blockHash,
    observedAt: preflight.observedAt, source: "base-sepolia-rpc" as const, maxPriceImpactBps: MAX_PRICE_IMPACT_BPS,
    pools, candidateFeeTiers: pools.filter(pool => pool.depthQualified).map(pool => pool.feeTier),
    depthQualified: pools.some(pool => pool.depthQualified) };
}
