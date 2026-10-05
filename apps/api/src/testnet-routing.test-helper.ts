import { TESTNET_DIRECT_POOLS, testnetDirectPool } from "@vezta-dex/core";
import { testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
export function routingSource() {
  const s = testnetQuoteSource(); const oldState = s.getPoolState;
  s.getPool = async fee => testnetDirectPool(fee).pool;
  s.getPoolState = async (pool, block) => ({ ...await oldState(pool, block),
    fee: TESTNET_DIRECT_POOLS.find(p => p.pool.toLowerCase() === pool.toLowerCase())!.feeTier });
  s.getTickSpacing = async pool => TESTNET_DIRECT_POOLS.find(p => p.pool.toLowerCase() === pool.toLowerCase())!.tickSpacing;
  s.quoteExactInput = async (token, _out, amount, fee) => {
    const forward = token.toLowerCase() === testnetIntent().tokenIn.toLowerCase();
    const spot = amount * BigInt(1000000 - fee) * (forward ? 400000000n : 1n)
      / (1000000n * (forward ? 1n : 400000000n));
    return { amountOut: spot * 9995n / 10000n, sqrtPriceX96After: 2n ** 96n * 20000n + (forward ? -1n : 1n),
      gasEstimate: 100000n, initializedTicksCrossed: 1 };
  };
  return s;
}
