import { expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "../chains/testnet";
import { parseTestnetSwapIntent, parseTestnetSwapQuote, buildTestnetSwapTransaction, testnetSwapIntentFromQuote } from "./testnet-swap";
import { TESTNET_DIRECT_POOLS } from "./testnet-swap-pools";
const now = Date.parse("2026-10-05T01:00:00Z");
const intent = { chainId: 84532, wallet: "0xb4f286aeb57ab61af848f7c1619ff98144aed44e", tokenIn: C.USDC.address,
  tokenOut: C.WETH.address, amountIn: "1000000", slippageBps: 50 };
const base = { ...intent, protocol: "v3", amountOut: "100000", minimumAmountOut: "99500", blockNumber: "123",
  blockHash: `0x${"ab".repeat(32)}`, observedAt: new Date(now).toISOString(), source: "base-sepolia-rpc" };
it("preserves absent legacy preference and accepts only curated paired routes", () => {
  expect(parseTestnetSwapIntent(intent)).not.toHaveProperty("routing");
  for (const selected of TESTNET_DIRECT_POOLS) {
    const q = parseTestnetSwapQuote({ ...base, pool: selected.pool, feeTier: selected.feeTier, routing: "best-direct" }, now);
    expect(testnetSwapIntentFromQuote(q)).toMatchObject({ routing: "best-direct" });
    const explicit = parseTestnetSwapQuote({ ...base, pool: selected.pool, feeTier: selected.feeTier, poolFeeTier: selected.feeTier }, now);
    expect(testnetSwapIntentFromQuote(explicit).poolFeeTier).toBe(selected.feeTier);
    if (selected.feeTier !== 3000) expect(() => parseTestnetSwapQuote({ ...base, pool: selected.pool, feeTier: selected.feeTier }, now)).toThrow();
    expect(() => parseTestnetSwapQuote({ ...base, pool: C.v3Factory, feeTier: selected.feeTier, routing: "best-direct" }, now)).toThrow();
    expect(() => parseTestnetSwapIntent({ ...intent, poolFeeTier: selected.feeTier, routing: "best-direct" })).toThrow();
  }
});
it("encodes the winning fee and binds calldata against a changed route", () => {
  const q = { ...base, pool: TESTNET_DIRECT_POOLS[1].pool, feeTier: 500, routing: "best-direct" };
  const tx = buildTestnetSwapTransaction(q, now);
  const outer = decodeFunctionData({ abi: parseAbi(["function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)"]), data: tx.data });
  const inner = decodeFunctionData({ abi: parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"]), data: outer.args[1][0] });
  expect(inner.args[0].fee).toBe(500);
});
