# Trading API Wallet Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-signed approval, Permit2 and swap only after live API and allowance evidence passes.

**Architecture:** Server retains raw quotes behind opaque, single-use IDs; browser displays a validated summary and signs only transactions bound to that ID. The wallet submits; server never signs or broadcasts. Keep the write control disabled until all release gates pass.

**Tech Stack:** TypeScript, viem, EIP-1193 wallet, Vitest, browser tests.

**Spec:** [Trading API swap design](../../specs/2026-09-27-trading-api-swap.md).

## Global Constraints

- Polygon 137, curated native USDC/WETH, `CLASSIC`, Universal Router 2.1.2.
- Quote expires after 30 seconds and after any intent change. Requote and review after approval.
- `permitAmount: EXACT` does not constrain ERC20-to-Permit2 approval by itself. Owner selected exact ERC20 approval per swap on 2026-09-27.
- Never forward Uniswap's observed `uint256.max` approval. Build `approve(canonical Permit2, amountIn)` and validate it independently.
- Nonzero existing allowance other than `amountIn` blocks the flow pending an explicit reset/review; never silently use or revoke it.
- No wallet write path until exact approval, fresh quote and browser evidence pass.

## Review Focus

1. Changed account or chain invalidates quote and typed data — Tasks 1 and 3.
2. Unknown spender, unlimited approval or cancel-first flow cannot silently open a wallet prompt — Task 2.
3. Fresh quote after approval changes minimum output; user sees and accepts it — Task 3.
4. Stale/replayed signature never reaches `/swap` — Task 3.
5. Timeout is not reported as failed or successful receipt — Task 4.

---

### Task 1: Live API evidence and quote storage

**Files:** `docs/research/2026-09-27-trading-api-live-evidence.md`; create `apps/api/src/quote-store.ts` and test; modify `apps/api/src/trading-api.ts`, `apps/api/src/server.ts` and tests.

- [x] Owner ran the sanitized Trading API smoke script in both directions: HTTP 200, `CLASSIC`, Polygon 137, exact input/output identity and no simulation failure for the small probes. See the live-evidence log.
- [x] Test quote ID binding to chain/account/tokens/amount/slippage/version, 30-second TTL, capacity cap and one-time consume; observed missing implementation before green tests.
- [x] Implement bounded in-memory storage and opaque IDs; return ID plus summary, never raw quote. Focused tests and full suite pass.
- [x] Record the Redis/shared-store requirement for replicas in the spec; the current store is single-process only.
- [x] Owner reran the local quote-store smoke check after restarting the API; both directions returned HTTP 200 with opaque IDs and no raw upstream payload.

### Task 2: Exact approval policy and validation

**Files:** Create `apps/api/src/exact-approval.ts` and test; later extend the API route and docs.

- [x] Run `node scripts/smoke-approval.mjs` in the owner's networked Terminal; both dummy-wallet proposals targeted canonical Permit2 with `uint256.max` allowance, and neither required cancellation. No private key or transaction was used. **Stop for the owner's allowance-policy decision before Task 2 writes.**
- [x] Owner selected exact ERC20 approval per swap; keep wallet writes disabled during implementation.
- [x] Test deterministic `approve(Permit2, amountIn)` calldata, wrong chain/token/amount and `uint256.max` existing-allowance blocking; observed missing-module failure.
- [x] Implement pure exact approval builder; no API call or wallet submission. Focused tests pass.
- [x] Add Polygon allowance read at a pinned block and zero/exact/other-nonzero states; expose only an unsigned `POST /api/v1/approval-plan`. Unit and handler tests cover stale blocks, wrong chain, excessive allowance and RPC failure.
- [x] Owner ran `smoke-approval-plan.mjs` against the local API: both zero-allowance Polygon reads returned exact unsigned Permit2 approval plans; no wallet transaction was submitted. See the live-evidence log.
- [x] Harden read-only connection against malformed chains, silent account changes, delayed grant events and interrupted prompts; verify unit regressions, independent review and eight mock-wallet browser cases. See [wallet connection evidence](../../research/2026-09-28-wallet-connection-validation.md).
- [ ] Verify read-only connection, account/network changes, rejection and quote invalidation in an installed wallet using the evidence document's steps.
- [ ] Browser-test account changes, zero-first tokens and allowance changes between preparation and wallet prompt before enabling writes.
- [ ] With a disposable funded wallet, verify exact approval receipt and allowance, requote, Permit2 signature, swap preparation and allowance after the swap before enabling UI writes.

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
