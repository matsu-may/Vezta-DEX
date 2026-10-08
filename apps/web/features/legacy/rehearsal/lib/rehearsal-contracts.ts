import { z } from "zod";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, validatePermit2Data, validateSwapCalldata, validateTradingIntent, validateTradingQuoteSummary, type Permit2Data, type ReceiptObservation, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
export const uintString = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(v => BigInt(v) < 1n << 256n);
const positive = uintString.refine(v => BigInt(v) > 0n);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v as `0x${string}`);
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v => v as Hex);
export const intentSchema = z.object({ chainId: z.literal(137), swapper: address, tokenIn: address, tokenOut: address, amountIn: positive, slippageBps: z.number().int().min(10).max(300) }).strict();
export function validateRehearsalIntent(intent: TradingIntent): void {
  intentSchema.parse(intent);
  validateTradingIntent(intent);
  if (intent.tokenIn.toLowerCase() !== TOKENS.USDC.address.toLowerCase() || intent.tokenOut.toLowerCase() !== TOKENS.WETH.address.toLowerCase() || BigInt(intent.amountIn) > 1000000n)
    throw new Error("Local rehearsal input must be at most 1 native USDC.");
}
const provenance = { chainId: z.literal(137), blockNumber: uintString, observedAt: z.string() };
export function recent(observed: string, now: number): void {
  const t = Date.parse(observed);
  if (!Number.isSafeInteger(t) || t > now + 5000 || now - t > 120000)
    throw new Error("Stale Polygon observation.");
}
const gasSchema = z.object({ gas: positive, gasPrice: positive }).strict().refine(v => BigInt(v.gas) <= 30000000n);
const transactionSchema = z.object({ chainId: z.literal(137), from: address, to: address, data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/).max(256002).transform(v => v as Hex), value: z.literal("0") }).strict();
const walletSchema = z.object({ ...provenance, account: address, accountKind: z.enum(["eoa", "blocked"]), accountNonce: uintString.refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)), balances: z.object({ USDC: uintString, WETH: uintString, POL: uintString }).strict(), tokenAllowance: uintString, permitAllowance: z.object({ amount: uintString, expiration: uintString, nonce: uintString }).strict().refine(v => BigInt(v.amount) < 1n << 160n && BigInt(v.expiration) < 1n << 48n && BigInt(v.nonce) < 1n << 48n), approvalGas: gasSchema.nullable() }).strict();
export type WalletState = z.infer<typeof walletSchema>;
export function parseState(value: unknown, intent: TradingIntent, now: number): WalletState {
  const { state } = z.object({ state: walletSchema }).strict().parse(value);
  recent(state.observedAt, now);
  if (state.account.toLowerCase() !== intent.swapper.toLowerCase())
    throw new Error("Wallet state owner mismatch.");
  return state;
}
const approvalSchema = z.object({ ...provenance, currentAllowance: uintString.nullable(), plan: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("approve"), transaction: transactionSchema }).strict(), z.object({ kind: z.literal("ready") }).strict(), z.object({ kind: z.literal("blocked-existing"), allowance: uintString }).strict(), z.object({ kind: z.literal("blocked-account") }).strict(),
  ]) }).strict();
export type Approval = z.infer<typeof approvalSchema>;
export function parseApproval(value: unknown, intent: TradingIntent, now: number): Approval {
  const { approval } = z.object({ approval: approvalSchema }).strict().parse(value);
  recent(approval.observedAt, now);
  const plan = approval.plan;
  if (plan.kind === "approve") {
    const tx = plan.transaction;
    const expected = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [POLYGON_PERMIT2, BigInt(intent.amountIn)] });
    if (approval.currentAllowance !== "0" || tx.from.toLowerCase() !== intent.swapper.toLowerCase() || tx.to.toLowerCase() !== intent.tokenIn.toLowerCase() || tx.data.toLowerCase() !== expected.toLowerCase())
      throw new Error("Approval mismatch.");
  }
  else if (plan.kind === "ready" && approval.currentAllowance !== intent.amountIn)
    throw new Error("Allowance mismatch.");
  else if (plan.kind === "blocked-account" && approval.currentAllowance !== null)
    throw new Error("Account state mismatch.");
  else if (plan.kind === "blocked-existing" && (approval.currentAllowance !== plan.allowance || plan.allowance === "0" || plan.allowance === intent.amountIn))
    throw new Error("Allowance state mismatch.");
  return approval;
}
const quoteSchema = z.object({ ...intentSchema.shape, amountOut: positive, minimumAmountOut: positive, routing: z.literal("CLASSIC"), routerVersion: z.literal("2.1.2"), requestId: z.string().min(1).max(256), quotedAt: z.string(), source: z.literal("uniswap-trading-api") }).strict();
export function parseQuote(value: unknown, intent: TradingIntent, now: number): {
  quote: TradingQuoteSummary;
  quoteId: string;
} {
  const result = z.object({ quote: quoteSchema, quoteId: z.string().regex(/^[0-9a-f]{48}$/) }).strict().parse(value);
  validateTradingQuoteSummary(result.quote, intent, now);
  return result;
}
const permitSchema = z.object({ ...provenance, quoteId: z.string().regex(/^[0-9a-f]{48}$/), quoteExpiresAt: z.string(), permit: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("sign"), data: z.unknown(), allowanceExpiresAt: z.string(), signatureDeadline: z.string() }).strict(), z.object({ kind: z.literal("ready") }).strict(), z.object({ kind: z.literal("blocked-account") }).strict(), z.object({ kind: z.literal("blocked-existing") }).strict(),
  ]) }).strict();
export type PermitPlan = Omit<z.infer<typeof permitSchema>, "permit"> & {
  permit: {
    kind: "sign";
    data: Permit2Data;
    allowanceExpiresAt: string;
    signatureDeadline: string;
  } | {
    kind: "ready" | "blocked-account" | "blocked-existing";
  };
};
export function parsePermit(value: unknown, intent: TradingIntent, quoteId: string, quote: TradingQuoteSummary, nonce: string, now: number): PermitPlan {
  const { permitPlan } = z.object({ permitPlan: permitSchema }).strict().parse(value);
  recent(permitPlan.observedAt, now);
  if (permitPlan.quoteId !== quoteId || Date.parse(permitPlan.quoteExpiresAt) !== Date.parse(quote.quotedAt) + 30000 || Date.parse(permitPlan.quoteExpiresAt) <= now)
    throw new Error("Permit quote mismatch.");
  if (permitPlan.permit.kind === "sign") {
    const data = validatePermit2Data(permitPlan.permit.data, intent, BigInt(nonce), now);
    if (Date.parse(permitPlan.permit.allowanceExpiresAt) !== Number(data.values.details.expiration) * 1000 || Date.parse(permitPlan.permit.signatureDeadline) !== Number(data.values.sigDeadline) * 1000)
      throw new Error("Permit display mismatch.");
    return { ...permitPlan, permit: { ...permitPlan.permit, data } };
  }
  return permitPlan as PermitPlan;
}
const prepSchema = z.object({ chainId: z.literal(137), quoteId: z.string().regex(/^[0-9a-f]{48}$/), intent: intentSchema, quoteExpiresAt: z.string(), deadline: positive, transaction: transactionSchema.extend(gasSchema.shape), simulation: z.object({ status: z.literal("success"), source: z.literal("polygon-rpc"), blockNumber: uintString, observedAt: z.string() }).strict() }).strict();
export type Preparation = z.infer<typeof prepSchema>;
export function parsePreparation(value: unknown, intent: TradingIntent, quoteId: string, quote: TradingQuoteSummary, permit: Permit2Data | undefined, signature: Hex | undefined, now: number): Preparation {
  const { preparation } = z.object({ preparation: prepSchema }).strict().parse(value);
  const p = preparation;
  if (p.quoteId !== quoteId || Date.parse(p.quoteExpiresAt) !== Date.parse(quote.quotedAt) + 30000 || Date.parse(p.quoteExpiresAt) <= now || BigInt(p.deadline) !== BigInt(Math.floor(Date.parse(p.quoteExpiresAt) / 1000)) || p.transaction.from.toLowerCase() !== intent.swapper.toLowerCase() || p.transaction.to.toLowerCase() !== POLYGON_UNIVERSAL_ROUTER_212.toLowerCase())
    throw new Error("Preparation identity mismatch.");
  validateTradingQuoteSummary(quote, p.intent, now);
  recent(p.simulation.observedAt, now);
  if (BigInt(p.transaction.gas) > 30000000n)
    throw new Error("Invalid gas limit.");
  validateSwapCalldata(p.transaction.data, { intent, summary: quote, permitData: permit, signature, deadline: BigInt(p.deadline), now });
  return p;
}
export const submissionRecordSchema = z.object({ kind: z.enum(["approval", "swap"]), intent: intentSchema, hash: hashSchema.nullable(), dataHash: hashSchema, minimumAmountOut: uintString, submittedAt: z.number().int().nonnegative().max(8640000000000000), submissionId: z.string().uuid(), afterBlock: uintString, expectedNonce: uintString.refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)) }).strict().superRefine((v, ctx) => { try {
  validateRehearsalIntent(v.intent);
  if (v.kind === "swap" && v.minimumAmountOut === "0")
    throw new Error();
}
catch {
  ctx.addIssue({ code: "custom", message: "Invalid local submission" });
} });
export type SubmissionRecord = Omit<z.infer<typeof submissionRecordSchema>, "intent"> & {
  intent: TradingIntent;
};
const wireBigint = uintString.transform(v => BigInt(v));
const identity = { chainId: z.literal(137), hash: hashSchema, source: z.literal("polygon-rpc"), observedAt: z.string() };
const observationSchema = z.discriminatedUnion("status", [
  z.object({ ...identity, status: z.literal("pending"), reason: z.enum(["not-found", "noncanonical-block", "inconsistent-block"]) }).strict(),
  z.object({ ...identity, status: z.literal("unavailable"), reason: z.enum(["wrong-chain", "invalid-receipt", "invalid-block", "rpc-unavailable"]) }).strict(),
  z.object({ ...identity, status: z.enum(["confirming", "confirmed", "reverted"]), receipt: z.object({ from: address, to: address, blockNumber: wireBigint, blockHash: hashSchema, confirmations: wireBigint, gasUsed: wireBigint, effectiveGasPrice: wireBigint, outcome: z.enum(["success", "reverted"]) }).strict() }).strict(),
]);
const executionSchema = z.object({ status: z.enum(["verified", "reverted", "unverified"]), nonce: uintString.optional(), amountIn: uintString.optional(), amountOut: uintString.optional(), gasCost: uintString.optional(), balances: walletSchema.shape.balances.optional(), tokenAllowance: uintString.optional(), permitAllowance: walletSchema.shape.permitAllowance.optional() }).strict();
export type Execution = z.infer<typeof executionSchema>;
export function parseObservation(value: unknown): {
  observation: ReceiptObservation;
  execution: Execution | null;
} { return z.object({ observation: observationSchema, execution: executionSchema.nullable() }).strict().parse(value); }
/** Transport shape validation; controller still independently enforces saved intent and calldata. */
export const rehearsalResponseSchemas = {
  quote: z.object({ quote: quoteSchema, quoteId: z.string().regex(/^[0-9a-f]{48}$/) }).strict(),
  approval: z.object({ approval: approvalSchema }).strict(), state: z.object({ state: walletSchema }).strict(),
  permit: z.object({ permitPlan: permitSchema }).strict(), prepare: z.object({ preparation: prepSchema }).strict(), recheck: z.object({ preparation: prepSchema }).strict(),
  receipt: z.object({ observation: observationSchema, execution: executionSchema.nullable() }).strict(),
};
