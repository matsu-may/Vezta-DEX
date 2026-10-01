import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { planForkMint } from "./lp-fork-mint-plan.mjs";

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

function response(overrides = {}, mintOverrides = {}) {
  const data = encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [{ token0: USDC, token1: WETH,
    fee: 500, tickLower: -887270, tickUpper: 887270, amount0Desired: 1_000_000n,
    amount1Desired: 371_000_000_000_000n, amount0Min: 995_000n, amount1Min: 370_200_000_000_000n,
    recipient: WALLET, deadline: 1000n, ...mintOverrides }] });
  return { token0: { tokenAddress: USDC, amount: "1000000" },
    token1: { tokenAddress: WETH, amount: "372000000000000" },
    tickLower: -887270, tickUpper: 887270,
    create: { chainId: 137, from: WALLET, to: MANAGER, value: "0x0", data }, ...overrides };
}

test("fork fixture plans only exact local ERC20 approvals from validated mint ceilings", () => {
  const plan = planForkMint({ body: response(), wallet: WALLET, nowSeconds: 900 });
  assert.equal(plan.desired.USDC, 1_000_000n);
  assert.equal(plan.desired.WETH, 371_000_000_000_000n);
  assert.equal(plan.approvals.length, 2);
  assert.deepEqual(plan.approvals.map(tx => decodeFunctionData({ abi: erc20Abi, data: tx.data }).args), [
    [MANAGER, 1_000_000n], [MANAGER, 371_000_000_000_000n],
  ]);
  assert.ok(!JSON.stringify(plan.approvals).includes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"));
});

test("fork fixture rejects changed token amount, target, recipient and WETH above local cap", () => {
  for (const body of [
    response({ token0: { tokenAddress: USDC, amount: "2000000" } }),
    response({ create: { ...response().create, to: "0x1111111111111111111111111111111111111111" } }),
    response({}, { recipient: "0x1111111111111111111111111111111111111111" }),
    response({ token1: { tokenAddress: WETH, amount: "2000000000000000" } },
      { amount1Desired: 1_995_000_000_000_000n, amount1Min: 1_990_000_000_000_000n }),
  ]) assert.throws(() => planForkMint({ body, wallet: WALLET, nowSeconds: 900 }));
});
