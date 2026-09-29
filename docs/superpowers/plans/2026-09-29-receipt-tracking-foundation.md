# Receipt Tracking Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare receipt reading and transaction lifecycle helpers for the approved Polygon swap flow without enabling wallet writes.

**Architecture:** A read-only viem adapter validates receipts against a submitted transaction's original intent and canonical block. A pure lifecycle helper retains that transaction identity through timeout and intent changes, and requests balance refresh only for confirmed successful receipts. The future wallet component will consume these helpers after its separate live gates.

**Tech Stack:** Existing TypeScript, viem 2.47.18, Vitest; no new dependencies.

**Spec:** [Trading API swap design](../../specs/2026-09-27-trading-api-swap.md), specifically wallet states, transaction validation and verification gates. This is a focused part of Task 4 in the [wallet-flow plan](2026-09-27-trading-api-wallet.md); approval/signature orchestration, UI wiring and funded gates remain separate.

## Global Constraints

- Polygon 137, curated native USDC/WETH, Universal Router 2.1.2.
- Reader receives a dedicated Polygon public client; never use a mutable injected wallet transport for receipt tracking.
- Bind hash, sender and target to the original submitted transaction. Approval target is the original input token; swap target is the curated router.
- Timeout or RPC failure cannot prove failure and cannot cause resubmission. Preserve the hash after input, account or chain changes.
- Refresh balances for the original chain/account only after a successful receipt meets the caller's explicit confirmation threshold. Approval confirmation requires a new quote, not a successful swap state.
- Confirmation count is explicit configuration, with no production default selected by this helper. Inclusion/confirmation is not a network-finality guarantee.
- No signing, broadcasting, quote polling, API credential exposure or wallet controls.

## Review Focus

1. A receipt for another hash, owner, target or chain must not report success — Task 1.
2. Noncanonical blocks, future receipt blocks and malformed statuses must not trigger balance refresh — Tasks 1 and 2.
3. Timeout followed by a late receipt must resolve the original transaction without resubmission — Task 2.
4. Account/intent changes must preserve monitoring and refresh the original account, never advance the new intent — Task 2.
5. Repeated observations must not repeatedly request balance refresh; transport errors must not disclose raw RPC text — Tasks 1 and 2.

---

### Task 1: Validated Polygon receipt reader

**Files:** Create `apps/web/lib/transaction-receipt.ts` and adjacent `transaction-receipt.test.ts`.

**Interfaces:**
- Consumes: `TradingIntent`, curated token/router identities and a narrow viem public-client interface.
- Produces: `SubmittedTransaction` (`kind: approval | swap`, `intent`, `hash`); `ReceiptObservation` (`pending | confirming | confirmed | reverted | unavailable`, original hash/chain, source and timestamp); `readTransactionReceipt(client, transaction, requiredConfirmations, now?): Promise<ReceiptObservation>`.

- [ ] Write tests using a real viem public client over controlled JSON-RPC responses. Verify successful/reverted receipts at an explicit threshold, missing receipt, wrong identity/chain, malformed fields, insufficient confirmations, noncanonical block, head behind receipt and sanitized transport errors. Validate parameters before any RPC call.
- [ ] Run `pnpm exec vitest run apps/web/lib/transaction-receipt.test.ts`. Expected: failure because the reader module is missing.
- [ ] Implement the reader. Use `getChainId`, `getTransactionReceipt`, uncached `getBlockNumber` and `getBlock({ blockNumber })`. Check chain before/after receipt reads, validate sender/target/hash/status/gas/block fields, and compare canonical block hash and number. Only the typed not-found error represents an absent receipt.
- [ ] Rerun the focused command. Expected: all receipt tests pass. Run `pnpm test`; expected: full suite passes.
- [ ] Commit reader and tests with `feat(dex): validate Polygon transaction receipts`.

### Task 2: Timeout, identity and balance-refresh lifecycle

**Files:** Create `apps/web/lib/receipt-tracking.ts` and adjacent `receipt-tracking.test.ts`; update README, roadmap and wallet-flow plan; create `docs/research/2026-09-29-receipt-tracking-validation.md`.

**Interfaces:**
- Consumes: Task 1's submitted identity and receipt observation.
- Produces: `startReceiptTracking(transaction, { requiredConfirmations, timeoutMs }, submittedAt): ReceiptTrackingState`; `invalidateReceiptIntent(state): ReceiptTrackingState`; `applyReceiptObservation(state, observation, now): { state, refreshBalancesFor, requiresFreshQuote }`.

- [ ] Write tests proving missing receipt before/after timeout, late success/revert, RPC uncertainty, wrong-operation observations, changed intent, original-account refresh, approval requote, duplicate-confirmation suppression and reorg recovery. No signature, simulation or approval receipt can stand in for a swap receipt.
- [ ] Run `pnpm exec vitest run apps/web/lib/receipt-tracking.test.ts`. Expected: failure because the lifecycle module is missing.
- [ ] Implement immutable state transitions. Copy/freeze original intent. Retain hash through uncertainty and changed intent; do not request a new quote for an invalidated approval intent. Gate success again on matching receipt identity and the configured threshold. Successful receipt effects are deduplicated by canonical block hash.
- [ ] Rerun focused tests, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Expected: exit 0; record existing warnings and any sandbox limitations accurately.
- [ ] Record owner-reported wallet checks and the implementation's actual limits. Commit with `feat(dex): track receipt uncertainty and confirmation effects`.

## Final gate

Request one fresh-context code review of this plan's changes. Resolve Critical/Important findings with regression tests; record deferred minors. Keep UI read-only and retain the main wallet plan's remaining installed-wallet and funded receipt gates. Do not mark milestone 2 or the complete wallet flow finished.
