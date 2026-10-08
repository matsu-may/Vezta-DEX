import {
  POLYGON_CHAIN_ID,
  TOKENS,
  V3_POOL_500,
  type Address,
  type SwapQuote,
} from "@vezta-dex/core";
import type { PoolChainSource } from "../discovery/pools";

export interface QuoteChainSource extends Pick<PoolChainSource, "getBlock" | "getPoolAddress"> {
  quoteExactInput(tokenIn: Address, tokenOut: Address, amountIn: bigint, feeTier: 500, blockNumber: bigint): Promise<{
    amountOut: bigint;
    gasEstimate: bigint;
  }>;
}

export class QuoteInputError extends Error {}

export class QuoteReader {
  constructor(private readonly chain: QuoteChainSource) {}

  async getQuote(input: { chainId: number; tokenIn: Address; amountIn: string }): Promise<SwapQuote> {
    if (input.chainId !== POLYGON_CHAIN_ID || input.amountIn.length > 19 || !/^[1-9]\d*$/.test(input.amountIn)) {
      throw new QuoteInputError("Invalid chain or amount");
    }
    const token = input.tokenIn.toLowerCase();
    let tokenOut: Address;
    let maximum: bigint;
    if (token === TOKENS.USDC.address.toLowerCase()) {
      tokenOut = TOKENS.WETH.address;
      maximum = 10_000n * 10n ** BigInt(TOKENS.USDC.decimals);
    } else if (token === TOKENS.WETH.address.toLowerCase()) {
      tokenOut = TOKENS.USDC.address;
      maximum = 5n * 10n ** BigInt(TOKENS.WETH.decimals);
    } else {
      throw new QuoteInputError("Unsupported token");
    }
    const amountIn = BigInt(input.amountIn);
    if (amountIn > maximum) throw new QuoteInputError("Amount exceeds preview limit");

    const block = await this.chain.getBlock();
    const pool = await this.chain.getPoolAddress(500, block.number);
    if (pool.toLowerCase() !== V3_POOL_500.toLowerCase()) throw new Error("Pool identity changed");
    const result = await this.chain.quoteExactInput(input.tokenIn, tokenOut, amountIn, 500, block.number);
    if (result.amountOut <= 0n) throw new Error("No executable quote");
    return {
      chainId: POLYGON_CHAIN_ID,
      protocol: "v3",
      pool: V3_POOL_500,
      feeTier: 500,
      tokenIn: input.tokenIn,
      tokenOut,
      amountIn: input.amountIn,
      amountOut: result.amountOut.toString(),
      quoterGasEstimate: result.gasEstimate.toString(),
      blockNumber: block.number.toString(),
      observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      source: "polygon-rpc",
    };
  }
}
