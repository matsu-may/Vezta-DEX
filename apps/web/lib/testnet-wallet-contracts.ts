import { z } from "zod";
import { getAddress, type Hex } from "viem";
import { parseTestnetSwapIntent, parseTestnetSwapQuote, inspectTestnetSwapTransaction, planTestnetTokenApproval,
  TESTNET_SWAP_POLICY as P, testnetFeeFieldsSchema, sameTestnetFeeFields, type TestnetSwapIntent, type TestnetSwapQuote } from "@vezta-dex/core";

export const walletUint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v => BigInt(v) < 2n ** 256n);
export const walletHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => BigInt(v) > 0n);
const id = z.string().regex(/^[a-f0-9]{48}$/);
const address = z.string().transform(v => getAddress(v));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const bound = (condition: boolean) => { if (!condition) throw new Error("Invalid testnet wallet binding"); };
const txSchema = testnetFeeFieldsSchema.safeExtend({ chainId: z.literal(P.chainId), from: address, to: address, value: z.literal("0"),
  data: z.string().max(4096).regex(/^0x(?:[0-9a-fA-F]{2})+$/).transform(v => v as Hex),
  nonce: walletUint.refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)),
  gas: walletUint.refine(v => BigInt(v) >= 21000n && BigInt(v) <= 650000n) }).strict();
export const walletActionSchema = z.object({ contextId: id, kind: z.enum(["swap", "approve", "reset"]),
  chainId: z.literal(P.chainId), transaction: txSchema, quoteExpiresAt: z.iso.datetime(),
  trackingExpiresAt: z.iso.datetime(), executionEnabled: z.boolean() }).strict();
export type TestnetWalletAction = z.infer<typeof walletActionSchema>;
export type TestnetWalletQuote = { quoteId: string; quote: TestnetSwapQuote; executionEnabled: boolean };
export function parseTestnetWalletQuote(value: unknown, intent: TestnetSwapIntent, now: number): TestnetWalletQuote {
  const response = z.object({ quoteId: id, quote: z.unknown(), priceImpactBps: z.number().int().min(0).max(100),
    qualification: z.object({ configurationVerified: z.literal(true), runtimeVerified: z.literal(true), executionEnabled: z.boolean() }) }).parse(value);
  const quote = parseTestnetSwapQuote(response.quote, now); bindIntent(intent, quote);
  return { quoteId: response.quoteId, quote, executionEnabled: response.qualification.executionEnabled };
}
function bindIntent(intent: TestnetSwapIntent, quote: TestnetSwapQuote) {
  bound(JSON.stringify(parseTestnetSwapIntent(intent)) === JSON.stringify(parseTestnetSwapIntent({ chainId: quote.chainId,
    wallet: quote.wallet, tokenIn: quote.tokenIn, tokenOut: quote.tokenOut, amountIn: quote.amountIn, slippageBps: quote.slippageBps })));
}
function inspectAction(action: TestnetWalletAction, intent: TestnetSwapIntent, quote: TestnetSwapQuote, now: number) {
  bindIntent(intent, quote); const tx = action.transaction;
  bound(same(tx.from, intent.wallet) && action.quoteExpiresAt === new Date(Date.parse(quote.observedAt) + 30000).toISOString());
  const expiry = Date.parse(action.trackingExpiresAt);
  bound(expiry > Date.parse(action.quoteExpiresAt) && expiry <= Date.parse(quote.observedAt) + 86430000);
  if (action.kind === "swap") inspectTestnetSwapTransaction({ chainId: tx.chainId, from: tx.from, to: tx.to, data: tx.data, value: tx.value }, quote, now);
  else {
    const plan = planTestnetTokenApproval(intent, action.kind === "reset" ? 1n : 0n);
    bound(plan.kind !== "ready" && plan.kind === action.kind);
    if (plan.kind !== "ready") bound(same(tx.to, plan.transaction.to) && same(tx.data, plan.transaction.data));
  }
}
const gasSchema = testnetFeeFieldsSchema.safeExtend({ estimatedGas: walletUint, gasLimit: walletUint,
  l2FeeCeiling: walletUint, l1FeeUpperBound: walletUint, operatorFeeUpperBound: walletUint,
  totalFeeBudget: walletUint, totalFeeQualified: z.literal(true), fork: z.literal("jovian") });
export const walletStudySchema = z.object({ status: z.enum(["blocked", "approval-required", "allowance-ready", "unsigned-prepared"]),
  reason: z.enum(["TESTNET_INPUT_BALANCE_LOW", "TESTNET_NATIVE_BALANCE_LOW", "TESTNET_L2_BUDGET_LOW", "TESTNET_TOTAL_BUDGET_LOW"]).nullable(),
  chainId: z.literal(P.chainId), quoteId: id, intent: z.unknown(), observedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  blockNumber: walletUint, blockHash: walletHash, accountNonce: walletUint, currentAllowance: walletUint,
  inputBalance: walletUint, nativeBalance: walletUint, approvalKind: z.enum(["ready", "approve", "reset"]),
  funding: z.object({ inputBalanceSufficient: z.boolean(), nativeEthPositive: z.boolean(), l2BudgetCovered: z.boolean().nullable(), totalBudgetCovered: z.boolean().nullable() }),
  simulation: z.object({ status: z.literal("success"), amountOut: walletUint.optional() }).nullable(),
  gas: gasSchema.nullable(), transaction: txSchema.nullable(), runtimeVerified: z.literal(true), executionEnabled: z.boolean(),
  minimumAmountOut: walletUint.optional(), priceImpactBps: z.number().int().min(0).max(100).nullable().optional() });
export const walletReviewSchema = z.object({ study: walletStudySchema, action: walletActionSchema.nullable() }).strict();
export function parseTestnetWalletReview(value: unknown, quoted: TestnetWalletQuote, kind: "approval" | "swap", now: number) {
  const quote = parseTestnetSwapQuote(quoted.quote, now);
  const response = walletReviewSchema.parse(value);
  const { study, action } = response; const intent = parseTestnetSwapIntent(study.intent); bindIntent(intent, quote);
  const observed = Date.parse(study.observedAt);
  bound(study.quoteId === quoted.quoteId && study.expiresAt === new Date(Date.parse(quote.observedAt) + 30000).toISOString()
    && observed <= now + 10000 && now - observed < 30000 && BigInt(study.blockNumber) >= BigInt(quote.blockNumber)
    && (study.blockNumber !== quote.blockNumber || same(study.blockHash, quote.blockHash)));
  if (!action) { bound(study.status !== "unsigned-prepared" && study.transaction === null); return { study: { ...study, intent }, action }; }
  const tx = action.transaction; const gas = study.gas;
  bound(study.status === "unsigned-prepared" && study.transaction !== null && JSON.stringify(tx) === JSON.stringify(study.transaction)
    && tx.nonce === study.accountNonce && action.executionEnabled === study.executionEnabled
    && study.funding.inputBalanceSufficient && study.funding.nativeEthPositive
    && study.funding.l2BudgetCovered === true && study.funding.totalBudgetCovered === true
    && BigInt(study.inputBalance) >= BigInt(intent.amountIn) && !!study.simulation && !!gas);
  inspectAction(action, intent, quote, now);
  if (!gas) throw new Error("Missing testnet fee budget");
  const estimate = BigInt(gas.estimatedGas); const limit = BigInt(gas.gasLimit); const price = BigInt(gas.gasPrice);
  const l1 = BigInt(gas.l1FeeUpperBound); const operator = BigInt(gas.operatorFeeUpperBound); const total = BigInt(gas.totalFeeBudget);
  bound(estimate >= 21000n && estimate <= (kind === "swap" ? 500000n : 200000n)
    && limit === (estimate * 120n + 99n) / 100n && tx.gas === gas.gasLimit && sameTestnetFeeFields(tx, gas)
    && BigInt(gas.l2FeeCeiling) === limit * price && l1 > 0n && l1 <= 10n ** 17n && operator <= 10n ** 17n
    && total === limit * price + 2n * (l1 + operator) && total < 10n ** 18n && BigInt(study.nativeBalance) >= total);
  const plan = planTestnetTokenApproval(intent, BigInt(study.currentAllowance));
  if (kind === "swap") bound(action.kind === "swap" && plan.kind === "ready" && study.approvalKind === "ready"
    && study.minimumAmountOut === quote.minimumAmountOut && study.priceImpactBps !== null && study.priceImpactBps !== undefined
    && study.simulation!.amountOut !== undefined && BigInt(study.simulation!.amountOut) >= BigInt(quote.minimumAmountOut));
  else bound(action.kind !== "swap" && action.kind === plan.kind && study.approvalKind === plan.kind);
  return { study: { ...study, intent }, action };
}
export const submissionSchema = z.object({ version: z.literal(1), intent: z.unknown(), quote: z.unknown(),
  action: walletActionSchema, attemptedAt: z.number().int().nonnegative().max(8640000000000000), hash: walletHash.nullable() }).strict();
export function parseTestnetSubmission(value: unknown) {
  const record = submissionSchema.parse(value); const intent = parseTestnetSwapIntent(record.intent);
  const observed = z.object({ observedAt: z.iso.datetime() }).parse(record.quote).observedAt;
  const quote = parseTestnetSwapQuote(record.quote, Date.parse(observed));
  inspectAction(record.action, intent, quote, Date.parse(observed));
  bound(record.attemptedAt >= Date.parse(observed) - 10000 && record.attemptedAt < Date.parse(record.action.quoteExpiresAt));
  return { ...record, intent, quote };
}
export type TestnetSubmission = ReturnType<typeof parseTestnetSubmission>;
const executionSchema = z.object({ status: z.enum(["verified", "reverted"]), amountIn: walletUint.optional(), amountOut: walletUint.optional(), approvedAmount: walletUint.optional(),
  l2GasCost: walletUint, actualTotalFeeQualified: z.literal(false), balances: z.object({ USDC: walletUint, WETH: walletUint, ETH: walletUint }),
  tokenAllowance: walletUint, allowanceMatchesExpected: z.boolean(), stateBlockNumber: walletUint, stateBlockHash: walletHash });
export const walletObservationResponseSchema = z.object({ observation: z.object({ contextId: id, hash: walletHash, kind: z.enum(["swap", "approve", "reset"]),
    chainId: z.literal(P.chainId), source: z.literal("base-sepolia-rpc"), observedAt: z.iso.datetime(), executionEnabled: z.boolean(),
    status: z.enum(["unknown-original", "pending", "confirming", "reorged", "unverified", "confirmed", "reverted"]),
    diagnostic: z.enum(["transaction-unavailable", "unsupported-transaction-type", "transaction-mismatch", "receipt-mismatch", "event-mismatch"]).optional(),
    confirmations: walletUint, blockNumber: walletUint.optional(), blockHash: walletHash.optional(), nonceUsed: z.boolean().optional(), execution: executionSchema.nullable() }) });

export function parseTestnetWalletObservation(value: unknown, record: TestnetSubmission, now: number) {
  const { observation: o } = walletObservationResponseSchema.parse(value);
  bound(record.hash !== null && same(o.hash, record.hash) && o.contextId === record.action.contextId && o.kind === record.action.kind);
  bound(o.diagnostic === undefined || o.status === "unverified");
  const observed = Date.parse(o.observedAt);
  bound(Number.isSafeInteger(now) && now >= 0 && observed <= now + 10000 && now - observed < 30000);
  if (o.status !== "confirmed" && o.status !== "reverted") { bound(o.execution === null); return o; }
  const e = o.execution;
  bound(e !== null && BigInt(o.confirmations) >= 2n && o.blockNumber !== undefined && o.blockHash !== undefined
    && BigInt(o.blockNumber) > BigInt(record.quote.blockNumber));
  if (!e) throw new Error("Missing testnet execution");
  bound(BigInt(e.stateBlockNumber) >= BigInt(o.blockNumber!) + 1n && BigInt(e.l2GasCost) > 0n
    && BigInt(e.l2GasCost) <= BigInt(record.action.transaction.gas) * BigInt(record.action.transaction.gasPrice)
    && e.allowanceMatchesExpected === (BigInt(e.tokenAllowance) === (record.action.kind === "approve" ? BigInt(record.intent.amountIn) : 0n)));
  if (o.status === "reverted") bound(e.status === "reverted" && e.amountIn === undefined && e.amountOut === undefined && e.approvedAmount === undefined);
  else {
    bound(e.status === "verified");
    if (record.action.kind === "swap") bound(e.amountIn === record.intent.amountIn && e.amountOut !== undefined
      && BigInt(e.amountOut) >= BigInt(record.quote.minimumAmountOut));
    else bound(e.amountIn === "0" && e.amountOut === "0" && e.approvedAmount === (record.action.kind === "reset" ? "0" : record.intent.amountIn));
  }
  return o;
}
