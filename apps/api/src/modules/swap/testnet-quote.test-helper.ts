import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import type { BaseSepoliaSwapSource } from "./testnet-swap-quote";
import { runtimeFixtureCode } from "../../infrastructure/deployments/testnet-runtime.test-helper";

export const TESTNET_NOW = 1790800002000;
export const TESTNET_HASH = `0x${"ab".repeat(32)}` as const;
export const testnetIntent = (reverse = false) => ({ chainId: 84532 as const,
  wallet: "0xb4f286aeb57ab61af848f7c1619ff98144aed44e",
  tokenIn: reverse ? C.WETH.address : C.USDC.address,
  tokenOut: reverse ? C.USDC.address : C.WETH.address,
  amountIn: reverse ? "1000000000000000" : "1000000", slippageBps: 50 as const });

export function testnetQuoteSource(): BaseSepoliaSwapSource {
  const sqrt = 2n ** 96n * 20000n;
  return {
    async getChainId() { return 84532; },
    async getLatestBlock() { return { number: 123n, timestamp: 1790800000n, hash: TESTNET_HASH }; },
    async getBlockHash() { return TESTNET_HASH; },
    async getCode(address) { return address.toLowerCase() === testnetIntent().wallet.toLowerCase() ? "0x" : runtimeFixtureCode(address) ?? "0x6000"; },
    async getDecimals(token) { return token.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18; },
    async getPool() { return P.pool; },
    async getPoolState() { return { token0: C.USDC.address, token1: C.WETH.address,
      factory: C.v3Factory, fee: 3000, liquidity: 100000000n, sqrtPriceX96: sqrt }; },
    async getTickSpacing() { return 60; },
    async getDependencyConfiguration() { return {
      router: { factory: C.v3Factory, weth: C.WETH.address, positionManager: C.v3PositionManager },
      quoter: { factory: C.v3Factory, weth: C.WETH.address },
      manager: { factory: C.v3Factory, weth: C.WETH.address },
    }; },
    async quoteOneUsdc() { return { amountOut: 1n, gasEstimate: 100000n }; },
    async quoteExactInput(tokenIn, _out, amount) {
      const forward = tokenIn.toLowerCase() === C.USDC.address.toLowerCase();
      const spot = forward ? amount * 997000n * 400000000n / 1000000n
        : amount * 997000n / (1000000n * 400000000n);
      return { amountOut: spot * 9995n / 10000n, sqrtPriceX96After: sqrt + (forward ? -1n : 1n),
        initializedTicksCrossed: 1, gasEstimate: 100000n };
    },
  };
}
