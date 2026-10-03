import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, isAddress, parseAbi } from "viem";
import { z } from "zod";
import { testnetFeeFieldsSchema, sameTestnetFeeFields } from "./testnet-transaction-fees";
import { BASE_SEPOLIA_CANDIDATE as C } from "./testnet";
import { TESTNET_SWAP_POLICY as P } from "./testnet-swap";
export const TESTNET_LP_WALLET_POLICY = Object.freeze({ chainId: 84532, ttlSeconds: 120, tickLower: -887220, tickUpper: 887220, maximumGas: 1000000 } as const);
const address = z.string().refine(v => isAddress(v)).transform(v => getAddress(v));
const uint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v => BigInt(v) < 2n ** 256n);
const positive = uint.refine(v => BigInt(v) > 0n);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => BigInt(v) > 0n);
const id = z.string().regex(/^[a-f0-9]{48}$/);
const wallet = address.refine(v => ![C.v3Factory,C.v3PositionManager,C.v3QuoterV2,C.USDC.address,C.WETH.address,P.pool,P.router,
  "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002"].some(a => a.toLowerCase() === v.toLowerCase()));
const base = { chainId: z.literal(84532), wallet };
const caps = { amount0Cap: uint.refine(v => BigInt(v) <= 5000000n), amount1Cap: uint.refine(v => BigInt(v) <= 50000000000000000n) };
export const testnetLpIntentSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("mint"), ...caps }).strict(),
  z.object({ ...base, kind: z.literal("increase"), ...caps, tokenId: positive }).strict(),
  z.object({ ...base, kind: z.literal("decrease"), tokenId: positive, percentage: z.union([z.literal(25),z.literal(50),z.literal(100)]) }).strict(),
  z.object({ ...base, kind: z.literal("collect"), tokenId: positive }).strict(),
  z.object({ ...base, kind: z.literal("burn"), tokenId: positive }).strict(),
]);
export const testnetLpStudyRequestSchema = z.object({ intent: testnetLpIntentSchema }).strict();
export const testnetLpRecheckRequestSchema = z.object({ contextId: id }).strict();
export const testnetLpReceiptRequestSchema = z.object({ contextId: id, hash }).strict();
const tick = z.number().int().min(-887220).max(887220).refine(v => v % 60 === 0);
export const testnetLpPlanSchema = z.object({ amount0Cap: uint, amount1Cap: uint, amount0Desired: uint, amount1Desired: uint, amount0Minimum: uint, amount1Minimum: uint,
  liquidity: uint.refine(v => BigInt(v) < 2n ** 128n), positionLiquidity: uint.refine(v => BigInt(v) < 2n ** 128n),
  storedOwed0: uint.refine(v => BigInt(v) < 2n ** 128n), storedOwed1: uint.refine(v => BigInt(v) < 2n ** 128n),
  tickLower: tick, tickUpper: tick, deadline: positive.nullable() }).strict().refine(v => v.tickLower < v.tickUpper);
export const testnetLpTransactionSchema = testnetFeeFieldsSchema.safeExtend({ chainId: z.literal(84532), from: wallet, to: address,
  data: z.string().max(4096).regex(/^0x(?:[a-fA-F0-9]{2})+$/), value: z.literal("0"),
  nonce: uint.refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)), gas: uint.refine(v => BigInt(v) >= 21000n && BigInt(v) <= 1000000n) }).strict();
const gasSchema = testnetFeeFieldsSchema.safeExtend({ estimatedGas: positive, gasLimit: positive, l2FeeCeiling: positive,
  l1FeeUpperBound: positive, operatorFeeUpperBound: uint, totalFeeBudget: positive,
  totalFeeQualified: z.literal(true), fork: z.literal("jovian") }).strict().refine(v => BigInt(v.gasLimit) <= 1000000n
    && BigInt(v.estimatedGas) >= 21000n && BigInt(v.gasLimit) === (BigInt(v.estimatedGas) * 120n + 99n) / 100n
    && BigInt(v.gasPrice) <= 2000000000000n && BigInt(v.l1FeeUpperBound) <= 10n ** 17n && BigInt(v.operatorFeeUpperBound) <= 10n ** 17n
    && BigInt(v.l2FeeCeiling) === BigInt(v.gasLimit) * BigInt(v.gasPrice)
    && BigInt(v.totalFeeBudget) === BigInt(v.l2FeeCeiling) + 2n * (BigInt(v.l1FeeUpperBound) + BigInt(v.operatorFeeUpperBound))
    && BigInt(v.totalFeeBudget) < 10n ** 18n);
const action = z.enum(["reset","approve","mint","increase","decrease","collect","burn"]);
const approvalToken = z.enum(["USDC","WETH"]).nullable();
export const testnetLpStudySchema = z.object({ contextId: id.nullable(), intent: testnetLpIntentSchema, status: z.enum(["blocked","prepared"]),
  reason: z.string().regex(/^TESTNET_[A-Z0-9_]+$/).nullable(), actionKind: action, approvalToken,
  plan: testnetLpPlanSchema, transaction: testnetLpTransactionSchema.nullable(), gas: gasSchema.nullable(),
  balances: z.object({ USDC: uint, WETH: uint, ETH: uint }).strict(), allowances: z.object({ USDC: uint,WETH: uint }).strict(),
  blockNumber: positive, blockHash: hash, observedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), source: z.literal("base-sepolia-rpc"),
  runtimeVerified: z.literal(true), executionEnabled: z.boolean() }).strict().superRefine((s,ctx) => {
    if ((s.actionKind === "reset" || s.actionKind === "approve") !== (s.approvalToken !== null)
      || (s.status === "prepared" ? s.contextId === null || s.transaction === null || s.gas === null || s.reason !== null : s.contextId !== null || s.transaction !== null || s.reason === null)) ctx.addIssue({ code: "custom", message: "Invalid LP preparation" });
    if (s.transaction && (!s.gas || s.transaction.gas !== s.gas.gasLimit || !sameTestnetFeeFields(s.transaction, s.gas)
      || BigInt(s.balances.ETH) < BigInt(s.gas!.totalFeeBudget))) ctx.addIssue({ code: "custom", message: "Invalid LP funding" });
  });
export const testnetLpReceiptSchema = z.object({ contextId: id, hash, intent: testnetLpIntentSchema, actionKind: action, approvalToken,
  executionModel: z.literal("metamask-delegation").optional(), gasPayer: address.optional(),
  l2GasCost: uint.refine(v => BigInt(v) <= 4000000000000000000n).optional(),
  chainId: z.literal(84532), source: z.literal("base-sepolia-rpc"), observedAt: z.iso.datetime(), blockNumber: positive, blockHash: hash,
  receiptBlockNumber: positive.nullable(), receiptBlockHash: hash.nullable(),
  status: z.enum(["unknown","pending","confirming","confirmed","reverted","unverified","reorged"]), confirmations: uint,
  diagnostic: z.enum(["transaction-unavailable","unsupported-transaction-type","transaction-mismatch","receipt-mismatch","event-mismatch","state-mismatch"]).nullable(),
  verified: z.boolean(), tokenId: positive.nullable(), amount0: uint, amount1: uint,
  actualTotalFeeQualified: z.literal(false), executionEnabled: z.boolean() }).strict().refine(r => {
    if ((r.executionModel === undefined) !== (r.gasPayer === undefined) || r.verified !== (r.status === "confirmed" || r.status === "reverted")
      || (r.receiptBlockNumber === null) !== (r.receiptBlockHash === null)
      || (r.actionKind === "approve" || r.actionKind === "reset") !== (r.approvalToken !== null)
      || (r.approvalToken === null && r.actionKind !== r.intent.kind)) return false;
    if (r.receiptBlockNumber !== null && BigInt(r.receiptBlockNumber) > BigInt(r.blockNumber)) return false;
    if (["confirmed","reverted","confirming"].includes(r.status) && (r.receiptBlockNumber === null
      || BigInt(r.confirmations) !== BigInt(r.blockNumber) - BigInt(r.receiptBlockNumber) + 1n)) return false;
    if (r.verified && (BigInt(r.confirmations) < 2n || r.diagnostic !== null)) return false;
    if (!r.verified && (r.amount0 !== "0" || r.amount1 !== "0")) return false;
    if ((r.status === "reverted" || ["approve","reset","burn"].includes(r.actionKind)) && (r.amount0 !== "0" || r.amount1 !== "0")) return false;
    if (r.status === "confirmed" && r.actionKind === "mint" && r.tokenId === null) return false;
    return true;
  });
export type TestnetLpIntent = z.infer<typeof testnetLpIntentSchema>;
export type TestnetLpStudy = z.infer<typeof testnetLpStudySchema>;
export type TestnetLpReceipt = z.infer<typeof testnetLpReceiptSchema>;
export type TestnetLpPlan = z.infer<typeof testnetLpPlanSchema>;
export type TestnetLpTransaction = z.infer<typeof testnetLpTransactionSchema>;
export const testnetLpWalletManagerAbi = parseAbi([
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint256 amount0,uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0,uint256 amount1)",
  "function burn(uint256 tokenId) payable",
]);
const same = (a: string,b: string) => a.toLowerCase() === b.toLowerCase();
export function inspectTestnetLpTransaction(value: unknown, now = Date.now()): void {
  const s = testnetLpStudySchema.parse(value); const {intent:i,plan:p,transaction:t} = s;
  if (!t || s.status !== "prepared" || !same(t.from,i.wallet)) throw new Error("Invalid LP transaction");
  const until = Date.parse(s.expiresAt); const observed = Date.parse(s.observedAt);
  if (!Number.isSafeInteger(now) || observed > now + 10000 || now >= until || until <= observed || until - observed > 120000) throw new Error("Expired LP review");
  const n = (v: string) => BigInt(v);
  if (p.deadline !== null && (n(p.deadline) !== BigInt(Math.floor(until/1000)) || n(p.deadline) <= BigInt(Math.floor(now/1000)))) throw new Error("Invalid LP deadline");
  if (i.kind === "mint" && (p.tickLower !== -887220 || p.tickUpper !== 887220 || p.positionLiquidity !== "0")) throw new Error("Invalid mint range");
  if (i.kind === "mint" || i.kind === "increase") {
    if (p.amount0Cap !== i.amount0Cap || p.amount1Cap !== i.amount1Cap || n(p.amount0Desired) > n(i.amount0Cap) || n(p.amount1Desired) > n(i.amount1Cap) || n(p.liquidity) === 0n
      || n(p.amount0Minimum) > n(p.amount0Desired) || n(p.amount1Minimum) > n(p.amount1Desired) || p.deadline === null) throw new Error("Invalid LP amounts");
  }
  if (i.kind === "decrease" && (n(p.liquidity) === 0n || n(p.liquidity) !== n(p.positionLiquidity)*BigInt(i.percentage)/100n || p.deadline === null)) throw new Error("Invalid decrease");
  if ((i.kind === "collect" || i.kind === "burn") && p.deadline !== null) throw new Error("Invalid LP deadline");
  let expected: string;
  if (s.actionKind === "approve" || s.actionKind === "reset") {
    if ((i.kind !== "mint" && i.kind !== "increase") || s.approvalToken === null) throw new Error("Invalid approval");
    const token = s.approvalToken; const amount = n(token === "USDC" ? i.amount0Cap : i.amount1Cap);
    if (!same(t.to,C[token].address) || (s.actionKind === "reset" ? n(s.allowances[token]) === 0n : s.allowances[token] !== "0" || amount === 0n)
      || n(s.allowances[token]) === amount) throw new Error("Invalid approval");
    expected = encodeFunctionData({ abi: erc20Abi,functionName:"approve",args:[C.v3PositionManager,s.actionKind === "reset" ? 0n : amount] });
  } else {
    if (s.actionKind !== i.kind || !same(t.to,C.v3PositionManager)) throw new Error("Invalid manager call");
    const decoded = decodeFunctionData({ abi:testnetLpWalletManagerAbi,data:t.data as `0x${string}` });
    if (i.kind === "mint") expected = encodeFunctionData({ abi:testnetLpWalletManagerAbi,functionName:"mint",args:[{
      token0:C.USDC.address,token1:C.WETH.address,fee:3000,tickLower:p.tickLower,tickUpper:p.tickUpper,
      amount0Desired:n(p.amount0Desired),amount1Desired:n(p.amount1Desired),amount0Min:n(p.amount0Minimum),amount1Min:n(p.amount1Minimum),recipient:i.wallet,deadline:n(p.deadline!) }] });
    else if (i.kind === "increase") expected = encodeFunctionData({ abi:testnetLpWalletManagerAbi,functionName:"increaseLiquidity",args:[{tokenId:n(i.tokenId),amount0Desired:n(p.amount0Desired),amount1Desired:n(p.amount1Desired),amount0Min:n(p.amount0Minimum),amount1Min:n(p.amount1Minimum),deadline:n(p.deadline!)}] });
    else if (i.kind === "decrease") expected = encodeFunctionData({ abi:testnetLpWalletManagerAbi,functionName:"decreaseLiquidity",args:[{tokenId:n(i.tokenId),liquidity:n(p.liquidity),amount0Min:n(p.amount0Minimum),amount1Min:n(p.amount1Minimum),deadline:n(p.deadline!)}] });
    else if (i.kind === "collect") expected = encodeFunctionData({ abi:testnetLpWalletManagerAbi,functionName:"collect",args:[{tokenId:n(i.tokenId),recipient:i.wallet,amount0Max:2n**128n-1n,amount1Max:2n**128n-1n}] });
    else { if (p.positionLiquidity !== "0" || p.storedOwed0 !== "0" || p.storedOwed1 !== "0") throw new Error("NFT not empty"); expected = encodeFunctionData({ abi:testnetLpWalletManagerAbi,functionName:"burn",args:[n(i.tokenId)] }); }
    if (!decoded) throw new Error("Invalid manager call");
    if ((i.kind === "mint" || i.kind === "increase") && (s.allowances.USDC !== i.amount0Cap || s.allowances.WETH !== i.amount1Cap
      || n(s.balances.USDC) < n(p.amount0Desired) || n(s.balances.WETH) < n(p.amount1Desired))) throw new Error("Invalid LP funding");
  }
  if (!same(t.data,expected)) throw new Error("LP calldata mismatch");
}
export function parseTestnetLpStudy(value: unknown, now = Date.now()): TestnetLpStudy {
  const s = testnetLpStudySchema.parse(value);
  const observed = Date.parse(s.observedAt), until = Date.parse(s.expiresAt);
  if (!Number.isSafeInteger(now) || observed > now + 10000 || now >= until || until <= observed || until-observed > 120000) throw new Error("Expired LP study");
  if (s.status === "prepared") inspectTestnetLpTransaction(s,now);
  return s;
}
export function parseTestnetLpReceipt(value: unknown, now = Date.now()): TestnetLpReceipt {
  const r = testnetLpReceiptSchema.parse(value), observed = Date.parse(r.observedAt);
  if (!Number.isSafeInteger(now) || observed > now+10000 || now-observed >= 120000) throw new Error("Stale LP receipt");
  return r;
}
