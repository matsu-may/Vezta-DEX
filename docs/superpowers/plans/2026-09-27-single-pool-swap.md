# Polygon Single-Pool Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an exact-input USDC/WETH v3 0.05% quote and a user-signed swap flow on Polygon, with writes disabled until live release gates pass.

**Architecture:** The API returns a fresh QuoterV2 result tied to a Polygon block. The browser validates the response and calculates minimum output with integer arithmetic. The wallet execution route is a pending decision; see the spec. The server does not sign or submit transactions.

**Tech Stack:** TypeScript, viem, React/Next.js, Vitest; existing `packages/core` registry and API/web structure.

**Spec:** [Single-pool swap design](../../specs/2026-09-27-single-pool-swap.md).

## Global Constraints

- Polygon `137`, native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`, WETH `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619`, fee `500` only.
- QuoterV2 `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`; v3 SwapRouter `0xE592427A0AEce92De3Edee1F18E0157C05861564` is one candidate for writes, from official Polygon deployments.
- Exact input, integer base units, `slippageBps` 10–300, quote age at most 30 seconds. No infinite approvals or server-side signing.
- Swap writes remain gated until live wallet, gas, slippage and receipt tests complete.

## Review Focus

1. Input decimal precision exceeds token decimals: reject before RPC or wallet prompt.
2. API responds with token/pool/router different from the selected registry: reject before approval.
3. Quote changes during approval: require new review before swapping.
4. Quote expires while a wallet prompt is open: invalidate and restart.
5. Transaction receipt status is reverted: show failure and do not refresh as success.

---

### Task 1: Quote arithmetic and identity

**Files:** `packages/core/src/swap.ts`, `packages/core/src/swap.test.ts`, `packages/core/src/index.ts`.

**Interfaces:** `parseExactInput(decimal, decimals): bigint`, `minimumOutput(quoteAmount, slippageBps): bigint`, `validateSwapQuote(quote, intent, now): void`.

- [ ] Write focused failing tests for decimals, wrong chain/token/pool, zero amount, slippage bounds, expiry, and minimum output rounding.
- [ ] Implement those pure functions; run focused and full tests, then typecheck.

### Task 2: QuoterV2 API

**Files:** `apps/api/src/quote.ts`, `apps/api/src/quote.test.ts`, `apps/api/src/chain.ts`, `apps/api/src/server.ts`, `apps/api/src/server.test.ts`.

**Interfaces:** `GET /api/v1/quote?chainId=137&tokenIn=<address>&amountIn=<integer>` returns `SwapQuote` or a controlled 400/503. A quote source checks the v3 pool at the same block and calls `quoteExactInputSingle`.

- [ ] Write failing adapter/endpoint tests for both directions, invalid amount/token, missing pool, RPC error, and timestamp.
- [ ] Implement current-block reads with fixed fee and source; no arbitrary contract address from the request.
- [ ] Run tests, typecheck, lint. Record runtime RPC restriction if live call cannot be checked here.

### Task 3: Read-only preview

**Files:** `apps/web/app/swap/page.tsx`, `apps/web/components/swap-form.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/quote-route.ts`.

**Interfaces:** Quote preview shows exact input/output, fee, route, data age and minimum output. No transaction builder is part of this task.

- [ ] Write failing tests for tampered quote, amount change and expired quote.
- [ ] Implement preview with explicit single-pool routing and error/loading states.
- [ ] Run tests, typecheck, lint, build, and browser checks when a local server is available.

### Task 4: Decide execution route, then wallet approval and swap state machine

**Files:** `apps/web/lib/wallet.ts`, `apps/web/lib/wallet.test.ts`, `apps/web/components/swap-form.tsx`, `apps/web/components/providers.tsx` if needed.

- [ ] Agree on direct v3 single-pool router or hosted Trading API. Record route, spender and payload evidence before implementation.
- [ ] Write failing state and wallet tests for chain switch, insufficient balance/gas, exact allowance, approval receipt, requote, rejection, simulation failure and swap receipt.
- [ ] Implement injected-wallet flow without backend signing; require re-review after approval.
- [ ] Keep the write control disabled by default and show the release-gate reason. Run all project checks.

### Task 5: Release evidence

**Files:** `docs/research/`, `README.md`, `docs/roadmap.md`, CI/browser checks as needed.

- [ ] With a funded disposable Polygon wallet and working RPC, record live quotes in both directions, transaction gas, approval and swap receipts, and rejected/reverted states.
- [ ] Compare representative routes and amounts with the Uniswap app. Enable the write control only if the evidence and review gates pass.
