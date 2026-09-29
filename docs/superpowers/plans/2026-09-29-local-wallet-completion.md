# Local Wallet Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Steps use checkbox syntax; one independent whole-change review follows implementation.

**Goal:** Complete the owner-approved six-step wallet preparation scope and deliver an opt-in loopback rehearsal plus owner checklist, without performing wallet actions.

**Architecture:** Fixed Polygon API performs read-only state, simulation and receipt verification. A browser controller validates every response, requests each wallet action only from an explicit user click, and retains uncertain/submitted identity across reload. Public swap controls remain disabled.

**Tech Stack:** Existing TypeScript, Next.js 16.1.6, viem 2.47.18, Zod 4.3.6, Vitest and mock browser wallet.

**Spec:** [Local rehearsal](../../specs/2026-09-29-local-swap-rehearsal-proposal.md), [existing swap constraints](../../specs/2026-09-27-trading-api-swap.md).

## Global Constraints

- Polygon 137, native USDC/WETH, CLASSIC, Universal Router 2.1.2, V2/V3/V4_NO_HOOKS.
- Exact ERC20 approval, exact unchanged PermitSingle, EOA only. Nonzero different allowance blocks.
- Quote TTL 30 seconds from request start; new quote and explicit review after approval. No signed request/broadcast retry.
- Rehearsal input USDC → WETH, maximum 1,000,000 base units; default slippage 50 bps.
- Local receipt policy: two canonical confirmations, 60-second wait; delayed is uncertainty. No production finality default.
- No agent signature, broadcast, funding, deployment, push, merge or main Vezta integration. Preserve the owner's next-env development import.

## Review Focus

1. A wallet action may succeed after account/input changes or unmount: retain its hash, never continue another action.
2. Reload during an unresolved wallet broadcast: retain uncertainty and prevent duplicate submission.
3. Pending reads sharing timestamps: serialize and isolate transaction identity, not timestamp alone.
4. A successful receipt is not economic proof: check actual transaction digest and curated token transfers/allowance.
5. A local route accidentally exposed outside development: production/missing gate/wrong-origin tests must fail closed.

### Task 1: Design and decisions

**Files:** rehearsal spec, this plan; research decision/evidence/checklist documents.
**Interfaces:** Produces the constraints and named contracts consumed by Tasks 2–6.
- [x] Record approved implementation scope, trust boundaries and routine technical decisions.
- [x] Self-review spec/plan against the six agreed steps. Commit documentation.

### Task 2: Shared validation and narrow API contracts

**Files:** `packages/core/src/{swap-calldata,swap-abi,permit-signature,transaction-receipt}.ts`; compatibility exports; `apps/api/src/{wallet-state,wallet-observation,swap-preparation,server,chain,main}.ts`; adjacent tests.
**Interfaces:** `WalletStateReader.getState(intent)` returns pinned EOA/balances/allowances/approval gas. `SwapPreparer.recheck(intent, quoteId)` returns the unchanged validated transaction with fresh simulation/gas, no upstream dispatch. `WalletObservationReader.observe(submission)` returns receipt and verified execution fields; `submission` includes original intent, hash and expected calldata digest.
- [x] Write missing shared/browser validation and API regressions: EOA/code, uint bounds, stale/block failure, gas, exact policy, changed nonce, recheck expiry, no second Uniswap dispatch and unrelated receipt transaction.
- [x] Run focused tests; observe RED. Implement minimal contracts and unchanged shared extraction.
- [x] Run focused tests and typecheck; observe GREEN. Commit.

### Task 3: Controller, tracking and reload recovery

**Files:** `apps/web/lib/{rehearsal-contracts,rehearsal-controller,rehearsal-storage,rehearsal-client}.ts`; adjacent tests.
**Interfaces:** `RehearsalController` exposes subscribe/snapshot/connect/quote/approve/sign/prepare/submit/checkReceipt/invalidate/dispose. A fixed typed client provides quote/approval/state/permit/prepare/recheck/receipt. Storage contains only validated submission metadata/uncertainty.
- [x] Write RED tests for full explicit-action flow, duplicate clicks, rejected/changed wallet, exact calldata, quote/signature expiry, changed allowance, simulation failure, gas review changes and ambiguous broadcast.
- [x] Implement minimal controller. Capture returned hashes even after invalidation; never retain signatures on reset/reload.
- [x] Write RED recovery/receipt tests: malformed storage, interrupted prompt marker, late receipt, original-account balance refresh, revert gas, serialized reads and nonce/replacement uncertainty.
- [x] Implement tracking/recovery and selected balance updates. Run focused tests/typecheck GREEN and commit.

### Task 4: Opt-in development route and UI

**Files:** `scripts/start-rehearsal.mjs`, `apps/web/app/rehearsal/page.tsx`, `apps/web/app/api/rehearsal/[action]/route.ts`, `apps/web/lib/rehearsal-gate.ts`, `apps/web/components/rehearsal-panel.tsx`; adjacent tests; environment examples/package script.
**Interfaces:** Launcher binds `127.0.0.1:3020`; gate requires development and launcher opt-in. Proxy accepts only fixed action names, exact local same-origin POST JSON and bounded inputs; fixed API origin from server env, no redirect or error leakage.
- [x] Write RED gate/proxy tests: missing/production gate, spoofed origin/host, oversized/unknown input and upstream leak/redirect/failure.
- [x] Implement route/launcher and concrete accessible review/status/recovery UI.
- [x] Write/render UI tests for each click boundary, status and retained pending identity. Run GREEN tests/typecheck and commit.

### Task 5: Integrated mock-wallet verification

**Files:** controller/component integration tests; a reproducible browser smoke script and evidence.
**Interfaces:** Uses only the Task 2 API schemas and Task 3 controller through Task 4 UI, no real wallet or funded RPC writes.
- [x] Add integrated cases for valid flow plus rejection, changed account/network, stale quote/allowance, RPC errors, insufficient balance/gas, failed simulation, revert/delay/reload.
- [x] Run deterministic tests and isolated mock browser checks at desktop/mobile when environment permits. Record an environmental block precisely if browser/server execution is unavailable; leave an owner-runnable command.
- [x] Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; expected exit 0. Preserve owner next-env change. Commit.

### Task 6: Independent review and owner handoff

**Files:** evidence, decision log, owner checklist, README, roadmap and existing wallet plan.
**Interfaces:** Handoff distinguishes deterministic proofs from all remaining installed-wallet/live/funded gates.
- [ ] Dispatch one fresh read-only reviewer for this plan's complete range. Rule on declined items and fix Critical/Important issues with RED→GREEN plus full suite.
- [x] Record implementation alternatives, rationale, limitations and actual verification; review findings are appended after the final reviewer.
- [x] Provide local launcher/runbook, wallet rejection/change checks, owner-only funded 1-USDC approval/swap checklist and sanitized evidence fields. Update existing plans accurately; commit.
- [ ] Keep current feature branch and public writes gated. No live wallet action, merge or push.

## Verification status

Tasks1–5 are code-complete. Full415 Vitest +28 Node script tests, typecheck, lint and build passed. Task5 permits environmental browser blocks: local launch returned EPERM; the supplied desktop/mobile smoke script is syntax-checked but unexecuted. Task6 final independent review remains pending. Actual browser/installed-wallet/funded gates remain unchecked in the original wallet plan and owner checklist.
