import { CurrencyAmount, Percent, NonfungiblePositionManager as Manager, Position } from "./uniswap-lp-sdk";
import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";
import { testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
import { lpAssert, lpSdkPool, lpSdkPosition, type LpNftState, type LpPoolState } from "./testnet-lp-position";
export const lpManagerAbi = parseAbi([
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0,uint256 amount1)",
  "function burn(uint256 tokenId) payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v => BigInt(v) < 2n ** 256n);
const positive = amount.refine(v => BigInt(v) > 0n);
function planSchema(chainId: TestnetChainId) {
  const C = testnetChainConfig(chainId).candidate;
const wallet = z.string().transform(v => getAddress(v)).refine(v => ![C.v3PositionManager, C.USDC.address, C.WETH.address, "0x0000000000000000000000000000000000000000"].some(a => a.toLowerCase() === v.toLowerCase()));
const caps = { amount0Cap: amount.refine(v => BigInt(v) <= 5000000n), amount1Cap: amount.refine(v => BigInt(v) <= 50000000000000000n), deadline: positive };
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mint"), wallet, ...caps, tickLower: z.number().int(), tickUpper: z.number().int() }).strict(),
  z.object({ kind: z.literal("increase"), wallet, ...caps, tokenId: positive }).strict(),
  z.object({ kind: z.literal("decrease"), wallet, tokenId: positive, liquidity: positive.refine(v => BigInt(v) < 2n ** 128n), deadline: positive }).strict(),
  z.object({ kind: z.literal("collect"), wallet, tokenId: positive }).strict(),
  z.object({ kind: z.literal("burn"), wallet, tokenId: positive }).strict(),
]);
  return schema;
}
export interface LpPlan<I extends TestnetChainId = 84532> {
  kind: "mint" | "increase" | "decrease" | "collect" | "burn";
  transaction: { chainId: I; from: Address; to: Address; data: Hex; value: "0" };
  amount0Desired?: string; amount1Desired?: string; amount0Minimum?: string; amount1Minimum?: string;
  liquidity?: string; executionEnabled: false;
}
// Internal unsigned planning only. Caller must qualify pinned runtime/state/ownership before invoking.
// This function is deliberately not a public HTTP execution endpoint.
export function planTestnetLp<I extends TestnetChainId = 84532>(value: unknown, state: { pool: LpPoolState; position?: LpNftState; actualOwner?: Address }, nowSeconds: number, ttlSeconds = 30, chainId: I = 84532 as I): LpPlan<I> {
  const C = testnetChainConfig(chainId).candidate;
  const schema = planSchema(chainId);
  const i = schema.parse(value); lpAssert(Number.isSafeInteger(nowSeconds) && nowSeconds > 0 && (ttlSeconds === 30 || ttlSeconds === 120));
  const pool = lpSdkPool(state.pool,chainId);
  let original: Position | undefined;
  if (i.kind !== "mint") {
    lpAssert(state.position && state.actualOwner?.toLowerCase() === i.wallet.toLowerCase(), "TESTNET_LP_OWNER_CHANGED");
    original = lpSdkPosition(state.position, state.pool,chainId);
  }
  if ("deadline" in i) lpAssert(BigInt(i.deadline) > BigInt(nowSeconds) && BigInt(i.deadline) <= BigInt(nowSeconds + ttlSeconds), "TESTNET_LP_DEADLINE_INVALID");
  const tolerance = new Percent(50, 10000);
  const collectOptions = { recipient: i.wallet,
    expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(pool.token0, state.position?.tokensOwed0.toString() ?? "0"),
    expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(pool.token1, state.position?.tokensOwed1.toString() ?? "0") };
  let data: Hex; const details: Omit<LpPlan<I>, "transaction" | "kind" | "executionEnabled"> = {};
  const unwrap = (calldata: string) => {
    const decoded = decodeFunctionData({ abi: lpManagerAbi, data: calldata as Hex });
    return decoded.functionName === "multicall" ? [...decoded.args[0]] : [calldata as Hex];
  };
  if (i.kind === "mint" || i.kind === "increase") {
    const tickLower = i.kind === "mint" ? i.tickLower : state.position!.tickLower;
    const tickUpper = i.kind === "mint" ? i.tickUpper : state.position!.tickUpper;
    lpAssert(tickLower >= -887220 && tickUpper <= 887220 && tickLower < tickUpper && tickLower % 60 === 0 && tickUpper % 60 === 0);
    const position = Position.fromAmounts({ pool, tickLower, tickUpper, amount0: i.amount0Cap, amount1: i.amount1Cap, useFullPrecision: true });
    lpAssert(BigInt(position.liquidity.toString()) > 0n && BigInt(position.liquidity.toString()) < 2n ** 128n);
    const generated = Manager.addCallParameters(position, { slippageTolerance: tolerance, deadline: i.deadline,
      ...(i.kind === "mint" ? { recipient: i.wallet, createPool: false } : { tokenId: i.tokenId }) });
    const calls = unwrap(generated.calldata); lpAssert(BigInt(generated.value) === 0n && calls.length === 1);
    data = calls[0];
    const call = decodeFunctionData({ abi: lpManagerAbi, data });
    lpAssert(call.functionName === (i.kind === "mint" ? "mint" : "increaseLiquidity"));
    if (call.functionName !== "mint" && call.functionName !== "increaseLiquidity") throw new Error("Invalid LP call");
    const p = call.args[0];
    const expected = position.mintAmounts; const minimum = position.mintAmountsWithSlippage(tolerance);
    lpAssert(p.amount0Desired === BigInt(expected.amount0.toString()) && p.amount1Desired === BigInt(expected.amount1.toString())
      && p.amount0Desired <= BigInt(i.amount0Cap) && p.amount1Desired <= BigInt(i.amount1Cap)
      && p.amount0Min === BigInt(minimum.amount0.toString()) && p.amount1Min === BigInt(minimum.amount1.toString())
      && p.amount0Min <= p.amount0Desired && p.amount1Min <= p.amount1Desired && p.deadline === BigInt(i.deadline));
    if (call.functionName === "mint") {
      const m = call.args[0]; lpAssert(m.token0.toLowerCase() === C.USDC.address.toLowerCase() && m.token1.toLowerCase() === C.WETH.address.toLowerCase()
        && m.fee === 3000 && m.tickLower === tickLower && m.tickUpper === tickUpper && m.recipient.toLowerCase() === i.wallet.toLowerCase());
    } else lpAssert("tokenId" in i && call.args[0].tokenId === BigInt(i.tokenId));
    Object.assign(details, { amount0Desired: p.amount0Desired.toString(), amount1Desired: p.amount1Desired.toString(),
      amount0Minimum: p.amount0Min.toString(), amount1Minimum: p.amount1Min.toString(), liquidity: position.liquidity.toString() });
  } else if (i.kind === "decrease") {
    lpAssert(original && BigInt(i.liquidity) <= state.position!.liquidity);
    const generated = Manager.removeCallParameters(original, { tokenId: i.tokenId,
      liquidityPercentage: new Percent(i.liquidity, original.liquidity), slippageTolerance: tolerance,
      deadline: i.deadline, burnToken: false, collectOptions });
    const calls = unwrap(generated.calldata); lpAssert(calls.length === 2 && BigInt(generated.value) === 0n);
    // SDK combines decrease+collect. Keep the decrease call alone so owed principal is explicit.
    data = calls[0]; const call = decodeFunctionData({ abi: lpManagerAbi, data });
    const collect = decodeFunctionData({ abi: lpManagerAbi, data: calls[1] });
    lpAssert(call.functionName === "decreaseLiquidity" && collect.functionName === "collect");
    if (call.functionName !== "decreaseLiquidity") throw new Error("Invalid LP decrease");
    const p = call.args[0]; const partial = new Position({ pool, tickLower: original.tickLower, tickUpper: original.tickUpper, liquidity: i.liquidity });
    const minimum = partial.burnAmountsWithSlippage(tolerance);
    lpAssert(p.tokenId === BigInt(i.tokenId) && p.liquidity === BigInt(i.liquidity) && p.deadline === BigInt(i.deadline)
      && p.amount0Min === BigInt(minimum.amount0.toString()) && p.amount1Min === BigInt(minimum.amount1.toString()));
    Object.assign(details, { amount0Minimum: p.amount0Min.toString(), amount1Minimum: p.amount1Min.toString(), liquidity: i.liquidity });
  } else if (i.kind === "collect") {
    const generated = Manager.collectCallParameters({ ...collectOptions, tokenId: i.tokenId });
    const calls = unwrap(generated.calldata); lpAssert(calls.length === 1 && BigInt(generated.value) === 0n); data = calls[0];
    const call = decodeFunctionData({ abi: lpManagerAbi, data }); lpAssert(call.functionName === "collect");
    if (call.functionName !== "collect") throw new Error("Invalid LP collect");
    lpAssert(call.args[0].tokenId === BigInt(i.tokenId) && call.args[0].recipient.toLowerCase() === i.wallet.toLowerCase()
      && call.args[0].amount0Max === 2n ** 128n - 1n && call.args[0].amount1Max === 2n ** 128n - 1n);
  } else {
    lpAssert(state.position!.liquidity === 0n && state.position!.tokensOwed0 === 0n && state.position!.tokensOwed1 === 0n, "TESTNET_LP_BURN_BLOCKED");
    data = encodeFunctionData({ abi: lpManagerAbi, functionName: "burn", args: [BigInt(i.tokenId)] });
  }
  return { kind: i.kind, transaction: { chainId, from: i.wallet, to: C.v3PositionManager, data, value: "0" }, ...details, executionEnabled: false };
}
export function planLpApprovals<I extends TestnetChainId>(plan: LpPlan<I>, allowances: { USDC: bigint; WETH: bigint }) {
  const C = testnetChainConfig(plan.transaction.chainId).candidate;
  lpAssert((plan.kind === "mint" || plan.kind === "increase") && plan.amount0Desired !== undefined && plan.amount1Desired !== undefined);
  return (["USDC", "WETH"] as const).map((token, n) => {
    const current = allowances[token]; const desired = BigInt(n === 0 ? plan.amount0Desired! : plan.amount1Desired!);
    lpAssert(typeof current === "bigint" && current >= 0n && current < 2n ** 256n);
    if (current === desired) return { token, kind: "ready" as const, amount: desired.toString(), transaction: null };
    const amount = current !== 0n ? 0n : desired;
    return { token, kind: current !== 0n ? "reset" as const : "approve" as const, amount: amount.toString(), transaction: {
      chainId: plan.transaction.chainId, from: plan.transaction.from, to: C[token].address, value: "0" as const,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [C.v3PositionManager, amount] }),
    } };
  });
}
