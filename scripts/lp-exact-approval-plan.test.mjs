import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { planLpExactApprovals } from "./lp-exact-approval-plan.mjs";

const { encodeFunctionData, decodeFunctionData, erc20Abi } = createRequire(new URL("../apps/api/package.json", import.meta.url))("viem");
const WALLET = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const mintAbi = [{ type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
  { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
  { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
  { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" },
  { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
  { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" },
] }], outputs: [] }];
const amounts = { USDC: "1000000", WETH: "372000000000000" };

function mintTransaction(overrides = {}, envelope = {}) {
  const data = encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{ token0: USDC, token1: WETH, fee: 500,
    tickLower: -887270, tickUpper: 887270, amount0Desired: 1000000n, amount1Desired: 371000000000000n,
    amount0Min: 995000n, amount1Min: 370200000000000n, recipient: WALLET, deadline: 1000n, ...overrides }] });
  return { chainId: 137, from: WALLET, to: MANAGER, value: "0x0", data, ...envelope };
}

test("plans exact approvals from validated mint maxima instead of the larger API WETH amount", () => {
  const plan = planLpExactApprovals({ wallet: WALLET, transaction: mintTransaction(), amounts,
    maxWethDesired: "380000000000000", allowances: { USDC: 0n, WETH: 0n }, nowSeconds: 900 });
  assert.equal(plan.kind, "approve");
  assert.deepEqual(plan.transactions.map(tx => [tx.chainId, tx.from, tx.to, tx.value]), [
    [137, WALLET, USDC, "0"], [137, WALLET, WETH, "0"],
  ]);
  assert.deepEqual(plan.transactions.map(tx => decodeFunctionData({ abi: erc20Abi, data: tx.data }).args), [
    [MANAGER, 1000000n], [MANAGER, 371000000000000n],
  ]);
  assert.ok(!JSON.stringify(plan).includes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"));
});

test("exact existing allowances need no transaction; one mismatch blocks both approvals", () => {
  const ready = planLpExactApprovals({ wallet: WALLET, transaction: mintTransaction(), amounts,
    maxWethDesired: "380000000000000", allowances: { USDC: 1000000n, WETH: 371000000000000n }, nowSeconds: 900 });
  assert.deepEqual(ready, { kind: "ready", transactions: [] });
  const blocked = planLpExactApprovals({ wallet: WALLET, transaction: mintTransaction(), amounts,
    maxWethDesired: "380000000000000", allowances: { USDC: 1n, WETH: 0n }, nowSeconds: 900 });
  assert.deepEqual(blocked, { kind: "blocked-existing", transactions: [], tokens: ["USDC"] });
});

test("invalid mint envelope, amounts and allowances cannot produce approvals", () => {
  const base = { wallet: WALLET, transaction: mintTransaction(), amounts,
    maxWethDesired: "380000000000000", allowances: { USDC: 0n, WETH: 0n }, nowSeconds: 900 };
  for (const changed of [
    { transaction: mintTransaction({}, { chainId: 1 }) },
    { transaction: mintTransaction({}, { to: "0x1111111111111111111111111111111111111111" }) },
    { transaction: mintTransaction({}, { value: "0x1" }) },
    { transaction: mintTransaction({ amount1Desired: 373000000000000n }) },
    { transaction: mintTransaction({ recipient: "0x1111111111111111111111111111111111111111" }) },
    { allowances: { USDC: -1n, WETH: 0n } },
    { maxWethDesired: "370000000000000" },
    { maxWethDesired: undefined },
  ]) {
    assert.throws(() => planLpExactApprovals({ ...base, ...changed }));
  }
});
