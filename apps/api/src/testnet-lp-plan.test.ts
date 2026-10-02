import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { planTestnetLp, lpManagerAbi, planLpApprovals } from "./testnet-lp-plan";
import { lpSource } from "./testnet-lp.test-helper";
const owner = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e" as const;
async function state() { const s = lpSource(); return { pool: await s.getLpPoolState(), position: await s.getPosition(), actualOwner: owner }; }
const request = { kind: "mint", wallet: owner, amount0Cap: "1000000", amount1Cap: "1000000000000000", tickLower: -60, tickUpper: 60, deadline: "1790800030" };
describe("unsigned Base Sepolia LP plans", () => {
  it("mint binds tokens, ticks, recipient, manager and spend caps", async () => {
    const plan = planTestnetLp(request, await state(), 1790800002);
    expect(plan.transaction).toMatchObject({ from: getAddress(owner), to: C.v3PositionManager, chainId: 84532, value: "0" });
    expect(plan.kind).toBe("mint"); expect(plan.executionEnabled).toBe(false);
    const call = decodeFunctionData({ abi: lpManagerAbi, data: plan.transaction.data });
    expect(call.functionName).toBe("mint");
    expect(plan.amount0Desired).toBe("1000000");
    expect(BigInt(plan.amount1Desired!)).toBeLessThanOrEqual(1000000000000000n);
  });
  it.each([{ tickLower: -61 }, { tickUpper: -60 }, { amount0Cap: "5000001" }, { amount1Cap: "50000000000000001" }, { deadline: "1790800999" }, { wallet: C.v3PositionManager }])("rejects unsafe mint input %j", async patch => {
    expect(() => planTestnetLp({ ...request, ...patch }, awaitState, 1790800002)).toThrow();
  });
  const awaitState = { pool: { token0: C.USDC.address, token1: C.WETH.address, factory: C.v3Factory, fee: 3000, liquidity: 100000000n, tick: 0, sqrtPriceX96: 2n ** 96n, feeGrowthGlobal0X128: 0n, feeGrowthGlobal1X128: 0n } };
  it("increase requires original owner and NFT range; decrease excludes automatic collection", async () => {
    const s = await state();
    const increase = planTestnetLp({ kind: "increase", wallet: owner, tokenId: "42", amount0Cap: "1000000", amount1Cap: "1000000000000000", deadline: request.deadline }, s, 1790800002);
    expect(decodeFunctionData({ abi: lpManagerAbi, data: increase.transaction.data }).functionName).toBe("increaseLiquidity");
    const remove = planTestnetLp({ kind: "decrease", wallet: owner, tokenId: "42", liquidity: "500000", deadline: request.deadline }, s, 1790800002);
    expect(decodeFunctionData({ abi: lpManagerAbi, data: remove.transaction.data }).functionName).toBe("decreaseLiquidity");
    expect(remove.amount0Minimum).toBeDefined();
    expect(() => planTestnetLp({ kind: "collect", wallet: owner, tokenId: "42" }, { ...s, actualOwner: C.USDC.address }, 1790800002)).toThrow();
  });
  it("collect returns ERC20 to owner; burn requires no liquidity or stored owed", async () => {
    const s = await state();
    const plan = planTestnetLp({ kind: "collect", wallet: owner, tokenId: "42" }, s, 1790800002);
    expect(decodeFunctionData({ abi: lpManagerAbi, data: plan.transaction.data }).functionName).toBe("collect");
    expect(() => planTestnetLp({ kind: "burn", wallet: owner, tokenId: "42" }, s, 1790800002)).toThrow();
    const cleared = { ...s, position: { ...s.position, liquidity: 0n, tokensOwed0: 0n, tokensOwed1: 0n } };
    expect(planTestnetLp({ kind: "burn", wallet: owner, tokenId: "42" }, cleared, 1790800002).kind).toBe("burn");
    expect(() => planTestnetLp({ kind: "decrease", wallet: owner, tokenId: "42", liquidity: "1000001", deadline: request.deadline }, s, 1790800002)).toThrow();
  });
  it("approval targets manager with exact desired spends, resetting every nonzero mismatch", async () => {
    const plan = planTestnetLp(request, await state(), 1790800002);
    const approvals = planLpApprovals(plan, { USDC: 1n, WETH: 0n });
    expect(approvals.map(a => a.kind)).toEqual(["reset", "approve"]);
    expect(approvals[0].amount).toBe("0");
    const ready = planLpApprovals(plan, { USDC: BigInt(plan.amount0Desired!), WETH: BigInt(plan.amount1Desired!) });
    expect(ready.map(a => a.kind)).toEqual(["ready", "ready"]);
  });
});
