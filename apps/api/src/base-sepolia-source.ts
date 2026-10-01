import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_CANDIDATE } from "@vezta-dex/core";
import type { BaseSepoliaDepthSource } from "./base-sepolia-depth";

const C = BASE_SEPOLIA_CANDIDATE;
const factoryAbi = [{ type: "function", name: "getPool", stateMutability: "view", inputs: [
  { type: "address" }, { type: "address" }, { type: "uint24" },
], outputs: [{ type: "address" }] }] as const;
const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" },
    { type: "uint16" }, { type: "uint8" }, { type: "bool" },
  ] },
] as const;
const quoterAbi = [{ type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }], outputs: [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
}] as const;

export function createBaseSepoliaPreflightSource(rpcUrl: string): BaseSepoliaDepthSource {
  let url: URL;
  try { url = new URL(rpcUrl); } catch { throw new Error("Invalid Base Sepolia RPC URL"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Base Sepolia RPC requires HTTPS or loopback HTTP");
  }
  const client = createPublicClient({ chain: baseSepolia,
    transport: http(rpcUrl, { timeout: 8_000, retryCount: 0 }) });
  const quoteExactInput: BaseSepoliaDepthSource["quoteExactInput"] = async (tokenIn, tokenOut, amountIn, fee, blockNumber) => {
    const { result } = await client.simulateContract({ address: C.v3QuoterV2,
      abi: quoterAbi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }], blockNumber });
    return { amountOut: result[0], sqrtPriceX96After: result[1],
      initializedTicksCrossed: result[2], gasEstimate: result[3] };
  };
  return {
    getChainId() { return client.getChainId(); },
    async getLatestBlock() {
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp, hash: block.hash ?? "0x" };
    },
    async getBlockHash(number) {
      const block = await client.getBlock({ blockNumber: number });
      return block.hash ?? "0x";
    },
    async getCode(address, blockNumber) {
      return await client.getCode({ address, blockNumber }) ?? "0x";
    },
    getDecimals(token, blockNumber) {
      return client.readContract({ address: token, abi: erc20Abi,
        functionName: "decimals", blockNumber });
    },
    getPool(feeTier, blockNumber) {
      return client.readContract({ address: C.v3Factory, abi: factoryAbi,
        functionName: "getPool", args: [C.USDC.address, C.WETH.address, feeTier], blockNumber });
    },
    async getPoolState(address: Address, blockNumber) {
      const [token0, token1, factory, fee, liquidity, slot0] = await Promise.all([
        client.readContract({ address, abi: poolAbi, functionName: "token0", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "token1", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "factory", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "fee", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "liquidity", blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "slot0", blockNumber }),
      ]);
      return { token0, token1, factory, fee, liquidity, sqrtPriceX96: slot0[0] };
    },
    async quoteOneUsdc(feeTier, blockNumber) {
      const result = await quoteExactInput(C.USDC.address, C.WETH.address, 1_000_000n, feeTier, blockNumber);
      return { amountOut: result.amountOut, gasEstimate: result.gasEstimate };
    },
    quoteExactInput,
  };
}
