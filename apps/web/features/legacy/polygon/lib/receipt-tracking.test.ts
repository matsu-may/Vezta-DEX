import { describe, expect, it } from "vitest";
import { TOKENS } from "@vezta-dex/core";
import type { Address, Hash } from "viem";
import type { ReceiptEvidence, ReceiptObservation, SubmittedTransaction } from "./transaction-receipt";
import { applyReceiptObservation, invalidateReceiptIntent, startReceiptTracking } from "./receipt-tracking";

const owner = "0x1111111111111111111111111111111111111111";
const hash: Hash = `0x${"ab".repeat(32)}`;
const blockHash: Hash = `0x${"cd".repeat(32)}`;
const otherHash: Hash = `0x${"ef".repeat(32)}`;
const router = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
const submittedAt = Date.parse("2026-09-29T06:00:00.000Z");
const policy = { requiredConfirmations: 2, timeoutMs: 60_000 };

function transaction(kind: "approval" | "swap" = "swap") {
  return {
    kind, hash,
    intent: { chainId: 137 as const, swapper: owner as Address, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "1000000", slippageBps: 50 },
  };
}

function pending(at = submittedAt + 1): ReceiptObservation {
  return { chainId: 137, hash, source: "polygon-rpc", observedAt: new Date(at).toISOString(), status: "pending", reason: "not-found" };
}

function included(kind: "approval" | "swap" = "swap", at = submittedAt + 1): {
  chainId: 137; hash: Hash; source: "polygon-rpc"; observedAt: string;
  status: "confirming" | "confirmed" | "reverted"; receipt: ReceiptEvidence;
} {
  return {
    chainId: 137, hash, source: "polygon-rpc", observedAt: new Date(at).toISOString(), status: "confirmed",
    receipt: { from: owner, to: kind === "approval" ? TOKENS.USDC.address : router, blockNumber: 100n, blockHash, confirmations: 2n, outcome: "success", gasUsed: 21000n, effectiveGasPrice: 2000000000n },
  };
}

describe("receipt tracking", () => {
  it("keeps an absent receipt pending before the wait deadline", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const update = applyReceiptObservation(state, pending(submittedAt + 59_999), submittedAt + 59_999);
    expect(update.state).toMatchObject({ status: "pending", waitExpired: false, transaction: { hash } });
    expect(update.refreshBalancesFor).toBeNull();
    expect(update.requiresFreshQuote).toBe(false);
  });

  it("marks timeout as delayed and keeps the hash instead of claiming failure", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const update = applyReceiptObservation(state, pending(submittedAt + 60_000), submittedAt + 60_000);
    expect(update.state).toMatchObject({ status: "delayed", waitExpired: true, transaction: { hash } });
    expect(update.refreshBalancesFor).toBeNull();
  });

  it("resolves a delayed swap with a late successful receipt", () => {
    const initial = startReceiptTracking(transaction(), policy, submittedAt);
    const delayed = applyReceiptObservation(initial, pending(submittedAt + 60_000), submittedAt + 60_000).state;
    const update = applyReceiptObservation(delayed, included("swap", submittedAt + 70_000), submittedAt + 70_000);
    expect(update.state).toMatchObject({ status: "confirmed", transaction: { hash, kind: "swap" } });
    expect(update.refreshBalancesFor).toEqual({ chainId: 137, account: owner });
    expect(update.requiresFreshQuote).toBe(false);
  });

  it("resolves a late revert without requesting successful-receipt effects", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation = included("swap", submittedAt + 70_000);
    observation.status = "reverted";
    observation.receipt = { ...observation.receipt, outcome: "reverted" };
    const update = applyReceiptObservation(state, observation, submittedAt + 70_000);
    expect(update.state).toMatchObject({ status: "reverted", transaction: { hash } });
    expect(update.refreshBalancesFor).toBeNull();
    expect(update.requiresFreshQuote).toBe(false);
  });

  it("keeps an included receipt confirming until the configured threshold", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation = included();
    observation.status = "confirming";
    observation.receipt = { ...observation.receipt, confirmations: 1n };
    const update = applyReceiptObservation(state, observation, submittedAt + 1);
    expect(update.state.status).toBe("confirming");
    expect(update.refreshBalancesFor).toBeNull();
  });

  it("retains confirmation progress when waiting has exceeded its deadline", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation = included("swap", submittedAt + 60_000);
    observation.status = "confirming";
    observation.receipt = { ...observation.receipt, confirmations: 1n };
    const update = applyReceiptObservation(state, observation, submittedAt + 60_000);
    expect(update.state).toMatchObject({ status: "delayed", waitExpired: true, observation: { receipt: { confirmations: 1n } } });
    expect(update.refreshBalancesFor).toBeNull();
  });

  it("preserves an uncertain transaction through RPC failure", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation: ReceiptObservation = { ...pending(), status: "unavailable", reason: "rpc-unavailable" };
    const update = applyReceiptObservation(state, observation, submittedAt + 1);
    expect(update.state).toMatchObject({ status: "unavailable", transaction: { hash } });
    expect(update.refreshBalancesFor).toBeNull();
    expect(update.requiresFreshQuote).toBe(false);
  });

  it.each([
    { hash: otherHash }, { chainId: 1 }, { source: "wallet" },
    { status: "signed" }, { status: "simulated" }, { observedAt: "invalid" },
  ])("ignores unrelated or nonreceipt observations: %j", (overrides) => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const update = applyReceiptObservation(state, { ...included(), ...overrides } as ReceiptObservation, submittedAt + 1);
    expect(update.state).toBe(state);
    expect(update.refreshBalancesFor).toBeNull();
  });

  it.each([
    { from: "0x2222222222222222222222222222222222222222" },
    { to: TOKENS.USDC.address }, { confirmations: 1n }, { confirmations: -1n },
    { outcome: "reverted" }, { blockHash: "0x1234" }, { gasUsed: -1n },
  ])("does not accept a contradictory confirmed receipt: %o", (overrides) => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation = included();
    const update = applyReceiptObservation(state, { ...observation, receipt: { ...observation.receipt, ...overrides } } as ReceiptObservation, submittedAt + 1);
    expect(update.state).toBe(state);
    expect(update.refreshBalancesFor).toBeNull();
  });

  it("continues tracking the original account after intent/account/network invalidation", () => {
    const state = invalidateReceiptIntent(startReceiptTracking(transaction(), policy, submittedAt));
    expect(state).toMatchObject({ intentChanged: true, transaction: { hash, intent: { swapper: owner, chainId: 137 } } });
    const update = applyReceiptObservation(state, included(), submittedAt + 1);
    expect(update.state.status).toBe("confirmed");
    expect(update.refreshBalancesFor).toEqual({ chainId: 137, account: owner });
    expect(update.requiresFreshQuote).toBe(false);
  });

  it("requires a new quote after approval confirmation without calling it a completed swap", () => {
    const state = startReceiptTracking(transaction("approval"), policy, submittedAt);
    const update = applyReceiptObservation(state, included("approval"), submittedAt + 1);
    expect(update.state.transaction.kind).toBe("approval");
    expect(update.requiresFreshQuote).toBe(true);
    expect(update.refreshBalancesFor).toEqual({ chainId: 137, account: owner });
  });

  it("does not advance a new intent after an invalidated approval confirms", () => {
    const state = invalidateReceiptIntent(startReceiptTracking(transaction("approval"), policy, submittedAt));
    const update = applyReceiptObservation(state, included("approval"), submittedAt + 1);
    expect(update.requiresFreshQuote).toBe(false);
    expect(update.refreshBalancesFor).toEqual({ chainId: 137, account: owner });
  });

  it("requests confirmation effects only once for repeated canonical receipts", () => {
    const state = startReceiptTracking(transaction("approval"), policy, submittedAt);
    const first = applyReceiptObservation(state, included("approval"), submittedAt + 1);
    const second = applyReceiptObservation(first.state, included("approval", submittedAt + 2), submittedAt + 2);
    expect(first.requiresFreshQuote).toBe(true);
    expect(second.requiresFreshQuote).toBe(false);
    expect(second.refreshBalancesFor).toBeNull();
    expect(second.state.status).toBe("confirmed");
  });

  it("tracks a reorg and refreshes only when a new canonical inclusion confirms", () => {
    const initial = startReceiptTracking(transaction(), policy, submittedAt);
    const first = applyReceiptObservation(initial, included(), submittedAt + 1).state;
    const reorg = { ...pending(submittedAt + 2), reason: "noncanonical-block" } as ReceiptObservation;
    const waiting = applyReceiptObservation(first, reorg, submittedAt + 2);
    expect(waiting.state.status).toBe("pending");
    expect(waiting.refreshBalancesFor).toBeNull();
    const replacement = included("swap", submittedAt + 3);
    replacement.receipt = { ...replacement.receipt, blockHash: otherHash, blockNumber: 101n };
    expect(applyReceiptObservation(waiting.state, replacement, submittedAt + 3).refreshBalancesFor).toEqual({ chainId: 137, account: owner });
  });

  it("ignores late observations from an older read", () => {
    const initial = startReceiptTracking(transaction(), policy, submittedAt);
    const confirmed = applyReceiptObservation(initial, included("swap", submittedAt + 2), submittedAt + 2).state;
    const late = applyReceiptObservation(confirmed, pending(submittedAt + 1), submittedAt + 3);
    expect(late.state).toBe(confirmed);
    expect(late.refreshBalancesFor).toBeNull();
  });

  it("copies the submitted identity so caller edits cannot retarget monitoring", () => {
    const submitted = transaction();
    const state = startReceiptTracking(submitted, policy, submittedAt);
    submitted.intent.swapper = "0x2222222222222222222222222222222222222222";
    const update = applyReceiptObservation(state, included(), submittedAt + 1);
    expect(update.refreshBalancesFor).toEqual({ chainId: 137, account: owner });
  });

  it("does not retain mutable caller-owned receipt objects", () => {
    const state = startReceiptTracking(transaction(), policy, submittedAt);
    const observation = included();
    const update = applyReceiptObservation(state, observation, submittedAt + 1);
    observation.receipt = { ...observation.receipt, outcome: "reverted" };
    expect(update.state.observation).toMatchObject({ receipt: { outcome: "success" } });
  });

  it.each([
    { requiredConfirmations: 0, timeoutMs: 60_000 },
    { requiredConfirmations: 2, timeoutMs: 0 },
    { requiredConfirmations: 2, timeoutMs: NaN },
    { requiredConfirmations: 1.5, timeoutMs: 60_000 },
  ])("rejects invalid tracking policy: %j", (config) => {
    expect(() => startReceiptTracking(transaction(), config, submittedAt)).toThrow();
  });

  it("rejects malformed submitted hashes before creating tracking state", () => {
    expect(() => startReceiptTracking({ ...transaction(), hash: "0x1234" } as SubmittedTransaction, policy, submittedAt)).toThrow();
  });
});
