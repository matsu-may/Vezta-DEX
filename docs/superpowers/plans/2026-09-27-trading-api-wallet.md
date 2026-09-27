# Trading API Wallet Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-signed approval, Permit2 and swap only after live API and allowance evidence passes.

**Architecture:** Server retains raw quotes behind opaque, single-use IDs; browser displays a validated summary and signs only transactions bound to that ID. The wallet submits; server never signs or broadcasts. Keep the write control disabled until all release gates pass.

**Tech Stack:** TypeScript, viem, EIP-1193 wallet, Vitest, browser tests.

**Spec:** [Trading API swap design](../../specs/2026-09-27-trading-api-swap.md).

## Global Constraints

- Polygon 137, curated native USDC/WETH, `CLASSIC`, Universal Router 2.1.2.
- Quote expires after 30 seconds and after any intent change. Requote and review after approval.
- `permitAmount: EXACT` does not constrain ERC20-to-Permit2 approval by itself.
- No write path until live response and approval calldata are inspected, policy settled, and browser evidence recorded.

## Review Focus

1. Changed account or chain invalidates quote and typed data — Tasks 1 and 3.
2. Unknown spender, unlimited approval or cancel-first flow cannot silently open a wallet prompt — Task 2.
3. Fresh quote after approval changes minimum output; user sees and accepts it — Task 3.
4. Stale/replayed signature never reaches `/swap` — Task 3.
5. Timeout is not reported as failed or successful receipt — Task 4.

---

### Task 1: Live API evidence and quote storage

**Files:** `docs/research/2026-09-27-trading-api-live-evidence.md`; create `apps/api/src/quote-store.ts` and test; modify `apps/api/src/trading-api.ts`, `apps/api/src/server.ts` and tests.

- [ ] Run the sanitized smoke script where outbound networking works; capture both directions and schema, with no secrets. Stop if routing/schema differs from spec.
- [ ] Test quote ID binding to chain/account/tokens/amount/slippage/version, 30-second TTL, capacity cap and one-time consume; observe failure.
- [ ] Implement bounded in-memory storage and opaque IDs; return ID plus summary, never raw quote. Rerun tests.
- [ ] Record the Redis/shared-store requirement for replicas.

### Task 2: Approval policy and validation

**Files:** Create `apps/api/src/approval.ts` and test; extend API route and docs.

- [x] Run `node scripts/smoke-approval.mjs` in the owner's networked Terminal; both dummy-wallet proposals targeted canonical Permit2 with `uint256.max` allowance, and neither required cancellation. No private key or transaction was used. **Stop for the owner's allowance-policy decision before Task 2 writes.**
- [ ] Test wrong chain/account/token/spender/amount and cancellation ordering; observe failure.
- [ ] Implement approval preparation through the shared Trading API client; return only validated unsigned transaction data. Rerun tests.

### Task 3: Permit2 and swap preparation

**Files:** Create `apps/api/src/swap-preparation.ts` and tests; modify `apps/web/lib/`, `apps/web/components/` and tests.

- [ ] Test quote/signature identity, changed intent, expiry, router target, calldata, value and deadline; observe failure.
- [ ] Implement single-use quote-bound Permit2 and `/swap` preparation; simulate returned transaction from connected account. Rerun tests.
- [ ] Browser-test rejected signature and changed account while prompt is open.

### Task 4: Receipts and release gate

**Files:** Wallet state component and tests; `docs/research/` evidence; README/roadmap.

- [ ] Test approval, permit, submission, confirmed, reverted and timeout states; observe failure.
- [ ] Implement receipt tracking; refresh balances only on confirmed receipt. Rerun tests.
- [ ] Test with small funded Polygon wallet, record sanitized hashes/gas/executed output, compare with Uniswap UI, obtain code review, then enable write control.
