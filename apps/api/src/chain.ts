import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { polygon } from "viem/chains";
import { POLYGON_CHAIN_ID, TOKENS, V3_FACTORY, V3_QUOTER } from "@vezta-dex/core";
import type { PoolChainSource } from "./pools";
import type { QuoteChainSource } from "./quote";
import type { AllowanceChainSource } from "./allowance-reader";

const factoryAbi = [{
  type: "function",
  name: "getPool",
  stateMutability: "view",
  inputs: [
    { name: "tokenA", type: "address" },
    { name: "tokenB", type: "address" },
    { name: "fee", type: "uint24" },
  ],
  outputs: [{ name: "pool", type: "address" }],
}] as const;

const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
] as const;

const quoterAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" },
    { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

export function createPolygonPoolSource(rpcUrl: string): PoolChainSource & QuoteChainSource & AllowanceChainSource {
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("POLYGON_RPC_URL must be HTTPS or local HTTP");
  }
  const client = createPublicClient({ chain: polygon, transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }) });

  return {
    async getBlock() {
      const chainId = await client.getChainId();
      if (chainId !== POLYGON_CHAIN_ID) throw new Error("RPC returned a different chain");
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp };
    },
    getPoolAddress(feeTier, blockNumber) {
      return client.readContract({
        address: V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [TOKENS.USDC.address, TOKENS.WETH.address, feeTier],
        blockNumber,
      });
    },
    async getPoolState(address: Address, blockNumber) {
      const [token0, token1, liquidity] = await Promise.all([
        client.readContract({ address, abi: poolAbi, functionName: "token0", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "token1", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "liquidity", blockNumber }),
      ]);
      return { token0, token1, liquidity };
    },
    async quoteExactInput(tokenIn, tokenOut, amountIn, feeTier, blockNumber) {
      const { result } = await client.simulateContract({
        address: V3_QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee: feeTier, sqrtPriceLimitX96: 0n }],
        blockNumber,
      });
      return { amountOut: result[0], gasEstimate: result[3] };
    },
    getTokenAllowance(token, owner, spender, blockNumber) {
      return client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
        blockNumber,
      });
    },
  };
}
