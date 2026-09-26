import { createPublicClient, http, type Address } from "viem";
import { polygon } from "viem/chains";
import { POLYGON_CHAIN_ID, TOKENS, V3_FACTORY } from "@vezta-dex/core";
import type { PoolChainSource } from "./pools";

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

export function createPolygonPoolSource(rpcUrl: string): PoolChainSource {
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
  };
}
