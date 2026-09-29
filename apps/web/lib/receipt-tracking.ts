import type { Address, Hash } from "viem";
import { z } from "zod";
import {
  copySubmittedTransaction, receiptTarget, validateConfirmationThreshold,
  type ReceiptObservation, type SubmittedTransaction,
} from "./transaction-receipt";

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hash);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);
const identitySchema = z.object({
  chainId: z.literal(137), hash: hashSchema, source: z.literal("polygon-rpc"), observedAt: z.string(),
});
const observationSchema = z.discriminatedUnion("status", [
  identitySchema.extend({ status: z.literal("pending"), reason: z.enum(["not-found", "noncanonical-block", "inconsistent-block"]) }),
  identitySchema.extend({ status: z.literal("unavailable"), reason: z.enum(["wrong-chain", "invalid-receipt", "invalid-block", "rpc-unavailable"]) }),
  identitySchema.extend({
    status: z.enum(["confirming", "confirmed", "reverted"]),
    receipt: z.object({
      from: addressSchema, to: addressSchema, blockNumber: z.bigint().nonnegative(), blockHash: hashSchema,
      confirmations: z.bigint().positive(), outcome: z.enum(["success", "reverted"]),
      gasUsed: z.bigint().positive(), effectiveGasPrice: z.bigint().nonnegative(),
    }),
  }),
]);

export interface ReceiptTrackingPolicy {
  readonly requiredConfirmations: number;
  readonly timeoutMs: number;
}

export interface ReceiptTrackingState {
  readonly transaction: SubmittedTransaction;
  readonly policy: ReceiptTrackingPolicy;
  readonly submittedAt: number;
  readonly status: "pending" | "delayed" | "confirming" | "confirmed" | "reverted" | "unavailable";
  readonly waitExpired: boolean;
  readonly intentChanged: boolean;
  readonly observation: ReceiptObservation | null;
  readonly lastObservationAt: number | null;
  readonly lastSuccessfulBlockHash: Hash | null;
}

export interface ReceiptTrackingUpdate {
  readonly state: ReceiptTrackingState;
  readonly refreshBalancesFor: { readonly chainId: 137; readonly account: Address } | null;
  readonly requiresFreshQuote: boolean;
}

function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) throw new Error("Invalid receipt tracking time");
}

export function startReceiptTracking(
  transaction: SubmittedTransaction,
  policy: ReceiptTrackingPolicy,
  submittedAt: number,
): ReceiptTrackingState {
  const snapshot = copySubmittedTransaction(transaction);
  validateConfirmationThreshold(policy.requiredConfirmations);
  validateTime(submittedAt);
  if (!Number.isSafeInteger(policy.timeoutMs) || policy.timeoutMs <= 0) throw new Error("Invalid receipt wait timeout");
  return Object.freeze({
    transaction: snapshot, policy: Object.freeze({ ...policy }), submittedAt, status: "pending",
    waitExpired: false, intentChanged: false, observation: null, lastObservationAt: null, lastSuccessfulBlockHash: null,
  });
}

/** Detach the submitted transaction from the edited form, retaining its original chain/account/hash. */
export function invalidateReceiptIntent(state: ReceiptTrackingState): ReceiptTrackingState {
  return state.intentChanged ? state : Object.freeze({ ...state, intentChanged: true });
}

/** Consume observations from the validated reader; effects are requests for the future UI, not writes. */
export function applyReceiptObservation(
  state: ReceiptTrackingState,
  value: ReceiptObservation,
  now: number,
): ReceiptTrackingUpdate {
  validateTime(now);
  if (now < state.submittedAt) throw new Error("Receipt check predates submission");
  const unchanged: ReceiptTrackingUpdate = { state, refreshBalancesFor: null, requiresFreshQuote: false };
  const parsed = observationSchema.safeParse(value);
  if (!parsed.success || parsed.data.hash.toLowerCase() !== state.transaction.hash.toLowerCase()) return unchanged;
  const observation = parsed.data;
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt) || observedAt < state.submittedAt || observedAt > now + 5_000
    || (state.lastObservationAt !== null && observedAt < state.lastObservationAt)) return unchanged;

  if ("receipt" in observation) {
    const receipt = observation.receipt;
    const thresholdMet = receipt.confirmations >= BigInt(state.policy.requiredConfirmations);
    if (receipt.from.toLowerCase() !== state.transaction.intent.swapper.toLowerCase()
      || receipt.to.toLowerCase() !== receiptTarget(state.transaction).toLowerCase()
      || (observation.status === "confirming" && thresholdMet)
      || (observation.status !== "confirming" && !thresholdMet)
      || (observation.status === "confirmed" && receipt.outcome !== "success")
      || (observation.status === "reverted" && receipt.outcome !== "reverted")) return unchanged;
    Object.freeze(receipt);
  }

  const waitExpired = now - state.submittedAt >= state.policy.timeoutMs;
  const successful = observation.status === "confirmed";
  const refresh = successful && observation.receipt.blockHash.toLowerCase() !== state.lastSuccessfulBlockHash?.toLowerCase();
  const next: ReceiptTrackingState = Object.freeze({
    ...state, observation: Object.freeze(observation), lastObservationAt: observedAt, waitExpired,
    status: waitExpired && (observation.status === "pending" || observation.status === "confirming") ? "delayed" : observation.status,
    lastSuccessfulBlockHash: successful ? observation.receipt.blockHash : state.lastSuccessfulBlockHash,
  });
  return {
    state: next,
    refreshBalancesFor: refresh ? { chainId: 137, account: state.transaction.intent.swapper } : null,
    requiresFreshQuote: refresh && state.transaction.kind === "approval" && !state.intentChanged,
  };
}
