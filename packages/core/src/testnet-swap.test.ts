import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, parseAbi } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "./testnet";
import { buildTestnetSwapTransaction, inspectTestnetSwapTransaction, planTestnetTokenApproval,
  TESTNET_SWAP_POLICY, parseTestnetSwapIntent } from "./testnet-swap";

const wallet = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const now = Date.parse("2026-10-01T10:00:00.000Z");
// Independently stated official ABI: SwapRouter02 omits deadline from its seven-field swap tuple.
const abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
const approvalAbi = parseAbi(["function approve(address spender,uint256 value) returns (bool)"]);

function quote(reverse = false) {
  return { chainId: 84532, wallet, tokenIn: reverse ? C.WETH.address : C.USDC.address,
    tokenOut: reverse ? C.USDC.address : C.WETH.address, amountIn: reverse ? "100000000000000" : "1000000",
    slippageBps: 50, protocol: "v3", pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad",
    feeTier: 3000, amountOut: reverse ? "15673" : "6341123394523806",
    minimumAmountOut: reverse ? "15594" : "6309417777551186", blockNumber: "47538437",
    blockHash: `0x${"ab".repeat(32)}`, observedAt: new Date(now - 2000).toISOString(), source: "base-sepolia-rpc" };
}
function intent(reverse = false) {
  const { chainId, wallet, tokenIn, tokenOut, amountIn, slippageBps } = quote(reverse);
  return { chainId, wallet, tokenIn, tokenOut, amountIn, slippageBps };
}

describe("Base Sepolia unsigned swap calldata", () => {
  it("accepts exact custom integer amounts within existing caps and binds selected slippage into calldata", () => {
    for (const reverse of [false, true]) for (const slippageBps of [5, 25, 50, 100]) {
      const q = { ...quote(reverse), amountIn: reverse ? "123456789012345" : "1234567", slippageBps };
      q.minimumAmountOut = (BigInt(q.amountOut) * BigInt(10000 - slippageBps) / 10000n).toString();
      expect(parseTestnetSwapIntent({ ...intent(reverse), amountIn: q.amountIn, slippageBps }).amountIn).toBe(q.amountIn);
      const tx = buildTestnetSwapTransaction(q, now);
      const outer = decodeFunctionData({ abi, data: tx.data });
      if (outer.functionName !== "multicall") throw new Error();
      const inner = decodeFunctionData({ abi, data: outer.args[1][0] });
      if (inner.functionName !== "exactInputSingle") throw new Error();
      expect(inner.args[0].amountIn).toBe(BigInt(q.amountIn));
      expect(inner.args[0].amountOutMinimum).toBe(BigInt(q.minimumAmountOut));
      expect(() => inspectTestnetSwapTransaction(tx, { ...q, slippageBps: slippageBps === 50 ? 100 : 50 }, now)).toThrow();
    }
  });
  it("rejects oversized, noncanonical amounts and invalid slippage without extending demo caps", () => {
    for (const amountIn of ["0", "5000001", "01", "1.5", "1e6", "-1"]) expect(() => parseTestnetSwapIntent({ ...intent(), amountIn })).toThrow();
    expect(() => parseTestnetSwapIntent({ ...intent(true), amountIn: "1000000000000001" })).toThrow();
    for (const slippageBps of [0, 4, 101, 5.5, "50", NaN]) expect(() => parseTestnetSwapIntent({ ...intent(), slippageBps })).toThrow();
  });
  it("builds both directions with exactly one deadline-wrapped ERC20 swap to the pinned router", () => {
    for (const reverse of [false, true]) {
      const q = quote(reverse); const tx = buildTestnetSwapTransaction(q, now);
      expect(tx).toMatchObject({ chainId: 84532, value: "0", to: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" });
      expect(tx.from.toLowerCase()).toBe(wallet);
      expect(tx.data.slice(0, 10)).toBe("0x5ae401dc");
      const outer = decodeFunctionData({ abi, data: tx.data });
      expect(outer.functionName).toBe("multicall");
      if (outer.functionName !== "multicall") throw new Error();
      expect(outer.args[0]).toBe(1790848828n);
      expect(outer.args[1]).toHaveLength(1);
      expect(outer.args[1][0].slice(0, 10)).toBe("0x04e45aaf");
      const inner = decodeFunctionData({ abi, data: outer.args[1][0] });
      expect(inner.functionName).toBe("exactInputSingle");
      if (inner.functionName !== "exactInputSingle") throw new Error();
      expect(inner.args[0]).toMatchObject({ fee: 3000, amountIn: BigInt(q.amountIn),
        amountOutMinimum: BigInt(q.minimumAmountOut), sqrtPriceLimitX96: 0n });
      expect(inner.args[0].tokenIn.toLowerCase()).toBe(q.tokenIn.toLowerCase());
      expect(inner.args[0].tokenOut.toLowerCase()).toBe(q.tokenOut.toLowerCase());
      expect(inner.args[0].recipient.toLowerCase()).toBe(wallet);
      expect(() => inspectTestnetSwapTransaction(tx, q, now)).not.toThrow();
    }
    expect(TESTNET_SWAP_POLICY.feeTier).toBe(3000);
  });

  it("rejects wrong intent/provenance, unsupported amounts, zero/overflow output and inconsistent minimum", () => {
    for (const change of [
      { chainId: 137 }, { tokenOut: C.USDC.address }, { amountIn: "5000001" }, { slippageBps: 300 },
      { pool: C.v3Factory }, { feeTier: 500 }, { protocol: "v4" }, { source: "uniswap-trading-api" },
      { amountOut: "0" }, { amountOut: (2n ** 256n).toString() }, { amountOut: "1", minimumAmountOut: "1" },
      { minimumAmountOut: "6309417777551187" }, { blockNumber: "0" }, { blockHash: "0xab" },
      { wallet: `0x${"00".repeat(20)}` }, { wallet: "0x0000000000000000000000000000000000000001" },
      { wallet: "0x0000000000000000000000000000000000000002" }, { wallet: TESTNET_SWAP_POLICY.router },
      { rawQuote: { secret: "hidden" } },
    ]) expect(() => buildTestnetSwapTransaction({ ...quote(), ...change }, now)).toThrow();
  });

  it("keeps the original quote lifetime and rejects stale/future evidence or invalid clocks", () => {
    const q = quote();
    expect(() => buildTestnetSwapTransaction(q, now + 27999)).not.toThrow();
    expect(() => buildTestnetSwapTransaction(q, now + 28000)).toThrow();
    expect(() => buildTestnetSwapTransaction({ ...q, observedAt: new Date(now + 11000).toISOString() }, now)).toThrow();
    expect(() => buildTestnetSwapTransaction(q, Number.NaN)).toThrow();
    expect(() => buildTestnetSwapTransaction(q, now + 0.5)).toThrow();
  });

  it("allows a new demo quote until 120 seconds while binding its original deadline", () => {
    const q = { ...quote(), quoteTtlSeconds: 120 };
    const tx = buildTestnetSwapTransaction(q, now + 35000);
    const decoded = decodeFunctionData({ abi, data: tx.data });
    expect(decoded.args?.[0]).toBe(1790848918n);
    expect(() => buildTestnetSwapTransaction(q, now + 117999)).not.toThrow();
    expect(() => buildTestnetSwapTransaction(q, now + 118000)).toThrow();
    expect(() => inspectTestnetSwapTransaction(buildTestnetSwapTransaction(quote(), now), q, now)).toThrow();
    expect(() => inspectTestnetSwapTransaction(tx, quote(), now)).toThrow();
    for (const ttl of [30, 121, 3600, "120", null]) {
      expect(() => buildTestnetSwapTransaction({ ...q, quoteTtlSeconds: ttl }, now)).toThrow();
    }
  });

  it("rejects changed envelope, recipient, minimum, deadline, extra calls and noncanonical bytes", () => {
    const q = quote(); const tx = buildTestnetSwapTransaction(q, now);
    const outer = decodeFunctionData({ abi, data: tx.data });
    if (outer.functionName !== "multicall") throw new Error();
    const inner = decodeFunctionData({ abi, data: outer.args[1][0] });
    if (inner.functionName !== "exactInputSingle") throw new Error();
    const wrap = (data: readonly `0x${string}`[], deadline = outer.args[0]) => encodeFunctionData({ abi, functionName: "multicall", args: [deadline, data] });
    const changedRecipient = encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{ ...inner.args[0], recipient: C.v3Factory }] });
    const changedMinimum = encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{ ...inner.args[0], amountOutMinimum: 0n }] });
    const changedLimit = encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{ ...inner.args[0], sqrtPriceLimitX96: 1n }] });
    for (const change of [
      { chainId: 137 }, { from: C.USDC.address }, { to: C.v3Factory }, { value: "1" },
      { data: inner.args[0] }, { data: outer.args[1][0] },
      { data: wrap([changedRecipient]) }, { data: wrap([changedMinimum]) }, { data: wrap([changedLimit]) },
      { data: wrap(outer.args[1], outer.args[0] + 1n) }, { data: wrap([...outer.args[1], ...outer.args[1]]) },
      { data: `${tx.data}00` }, { secret: "hidden" },
    ]) expect(() => inspectTestnetSwapTransaction({ ...tx, ...change }, q, now)).toThrow();
    expect(() => inspectTestnetSwapTransaction(tx, quote(true), now)).toThrow();
  });
});

describe("Base Sepolia exact token approval plan", () => {
  it("approves exact input directly to SwapRouter02 in both directions", () => {
    for (const reverse of [false, true]) {
      const i = intent(reverse); const plan = planTestnetTokenApproval(i, 0n);
      expect(plan.kind).toBe("approve");
      if (plan.kind === "ready") throw new Error();
      expect(plan.transaction).toMatchObject({ chainId: 84532, value: "0", to: i.tokenIn });
      const decoded = decodeFunctionData({ abi: approvalAbi, data: plan.transaction.data });
      expect(decoded.args[0]).toBe("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4");
      expect(decoded.args[1]).toBe(BigInt(i.amountIn));
    }
  });

  it("returns ready only for exact equality and only a reset for any nonzero mismatching allowance", () => {
    expect(planTestnetTokenApproval(intent(), 1000000n)).toEqual({ kind: "ready" });
    for (const current of [1n, 999999n, 1000001n, 2n ** 256n - 1n]) {
      const plan = planTestnetTokenApproval(intent(), current);
      expect(plan.kind).toBe("reset");
      if (plan.kind === "ready") throw new Error();
      expect(decodeFunctionData({ abi: approvalAbi, data: plan.transaction.data }).args[1]).toBe(0n);
      expect(Object.hasOwn(plan, "transactions")).toBe(false);
    }
    expect(() => planTestnetTokenApproval(intent(), -1n)).toThrow();
    expect(() => planTestnetTokenApproval(intent(), 2n ** 256n)).toThrow();
    expect(() => planTestnetTokenApproval({ ...intent(), chainId: 137 }, 0n)).toThrow();
  });
});
