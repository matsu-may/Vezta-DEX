import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { reviewCreateCalldata, reviewApprovalCalldata } from "./lp-calldata-review.mjs";

const { encodeFunctionData } = createRequire(new URL("../apps/api/package.json", import.meta.url))("viem");
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
const approveAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [
  { name: "spender", type: "address" }, { name: "amount", type: "uint256" },
], outputs: [{ type: "bool" }] }];
const amounts = { USDC: "1000000", WETH: "372000000000000" };

function mintData(overrides = {}) {
  return encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{ token0: USDC, token1: WETH, fee: 500,
    tickLower: -887270, tickUpper: 887270, amount0Desired: 1000000n, amount1Desired: 372000000000000n,
    amount0Min: 995000n, amount1Min: 370140000000000n, recipient: WALLET, deadline: 1000n, ...overrides }] });
}

test("v3 mint calldata must bind token pair, amounts, range, recipient and deadline", () => {
  const review = reviewCreateCalldata(mintData(), { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.deepEqual(review, { callKind: "mint", decodedChecksPassed: true, checks: {
    tokenPairMatches: true, feeMatches: true, ticksMatch: true, desiredAmountsMatch: true,
    minimumsBounded: true, minimumsWithin50Bps: true, recipientMatchesWallet: true, deadlineValid: true,
  } });
  const wrongRecipient = reviewCreateCalldata(mintData({ recipient: "0x1111111111111111111111111111111111111111" }),
    { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.equal(wrongRecipient.decodedChecksPassed, false);
  assert.equal(wrongRecipient.checks.recipientMatchesWallet, false);
  const excessSpend = reviewCreateCalldata(mintData({ amount1Desired: 744000000000000n }),
    { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.equal(excessSpend.checks.desiredAmountsMatch, false);
  assert.equal(excessSpend.decodedChecksPassed, false);
  const looseMinima = reviewCreateCalldata(mintData({ amount0Min: 1n }),
    { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.equal(looseMinima.checks.minimumsWithin50Bps, false);
  assert.equal(looseMinima.decodedChecksPassed, false);
});

test("mint mismatch reports only bounded direction and size while remaining rejected", () => {
  const review = reviewCreateCalldata(mintData({ amount0Desired: 1000001n, amount1Desired: 371000000000000n,
    amount1Min: 370000000000000n }), { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.equal(review.decodedChecksPassed, false);
  assert.deepEqual(review.desiredAmountDiagnostics, {
    USDC: { relation: "higher", differenceBand: "one-unit" },
    WETH: { relation: "lower", differenceBand: "within-50-bps" },
  });
  assert.ok(!JSON.stringify(review).includes("371000000000000"));
});

test("mint diagnostic distinguishes differences above 50 bps", () => {
  const review = reviewCreateCalldata(mintData({ amount1Desired: 744000000000000n }),
    { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.deepEqual(review.desiredAmountDiagnostics, {
    USDC: { relation: "equal", differenceBand: "equal" },
    WETH: { relation: "higher", differenceBand: "over-50-bps" },
  });
  assert.equal(review.decodedChecksPassed, false);
});

test("unknown create selectors cannot pass decoded checks", () => {
  const review = reviewCreateCalldata("0x095ea7b3", { wallet: WALLET, amounts, nowSeconds: 900 });
  assert.deepEqual(review, { callKind: "unknown", decodedChecksPassed: false });
});

test("v3 approvals accept only exact token amounts to the position manager", () => {
  const exact = reviewApprovalCalldata({ to: USDC, data: encodeFunctionData({ abi: approveAbi,
    functionName: "approve", args: [MANAGER, 1000000n] }) }, amounts);
  assert.deepEqual(exact, { token: "USDC", callKind: "approve", spenderMatchesManager: true,
    amountKind: "exact", exactPolicyMatches: true });
  const unlimited = reviewApprovalCalldata({ to: WETH, data: encodeFunctionData({ abi: approveAbi,
    functionName: "approve", args: [MANAGER, (1n << 256n) - 1n] }) }, amounts);
  assert.equal(unlimited.amountKind, "unlimited");
  assert.equal(unlimited.exactPolicyMatches, false);
  const wrongSpender = reviewApprovalCalldata({ to: USDC, data: encodeFunctionData({ abi: approveAbi,
    functionName: "approve", args: ["0x1111111111111111111111111111111111111111", 1000000n] }) }, amounts);
  assert.equal(wrongSpender.spenderMatchesManager, false);
  assert.equal(wrongSpender.exactPolicyMatches, false);
});
