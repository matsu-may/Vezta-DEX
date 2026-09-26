# Polygon Trading API Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a wallet-bound exact-input Uniswap AMM quote for native USDC/WETH on Polygon, then a user-signed swap flow after live release gates pass.

**Architecture:** Keep QuoterV2 as an indicative single-pool comparison. The server calls Uniswap Trading API with its private API key, validates a `CLASSIC` quote, and sends a bounded summary to the browser. Later it will validate approval and unsigned swap payloads; only the user's wallet signs and submits.

**Tech Stack:** TypeScript, viem, React/Next.js, Vitest; existing `packages/core` registry and API/web structure.

**Spec:** [Trading API swap design](../../specs/2026-09-27-trading-api-swap.md). Detailed follow-ons: [rate budget](2026-09-27-trading-api-rate-budget.md) and [wallet flow](2026-09-27-trading-api-wallet.md).

## Global Constraints

- Polygon `137`, native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`, WETH `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619`.
- Trading API `CLASSIC` across V2/V3/V4, Universal Router `2.1.2` on Polygon `0xDc264714F68d84CF29BC605589405E78bDBE7C9f`; use the version header on quote and swap requests where documented.
- Exact input, integer base units, `slippageBps` 10–300, quote age at most 30 seconds. Inspect ERC20 approval calldata before deciding allowance policy; no server-side signing.
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

- [x] Write focused tests for decimals, wrong chain/token/pool, zero amount, slippage bounds, expiry, and minimum output rounding.
- [x] Implement those pure functions; run focused and full tests, then typecheck.

### Task 2: QuoterV2 API

**Files:** `apps/api/src/quote.ts`, `apps/api/src/quote.test.ts`, `apps/api/src/chain.ts`, `apps/api/src/server.ts`, `apps/api/src/server.test.ts`.

**Interfaces:** `GET /api/v1/quote?chainId=137&tokenIn=<address>&amountIn=<integer>` returns `SwapQuote` or a controlled 400/503. A quote source checks the v3 pool at the same block and calls `quoteExactInputSingle`.

- [x] Test both token directions, invalid amount/token, missing pool and timestamp.
- [x] Implement current-block reads with fixed fee and source; no arbitrary contract address from the request.
- [ ] Verify the live RPC and browser runtime outside the restricted local socket environment.

### Task 3: Read-only preview

**Files:** `apps/web/app/swap/page.tsx`, `apps/web/components/swap-form.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/quote-route.ts`.

**Interfaces:** Quote preview shows exact input/output, fee, route, data age and minimum output. No transaction builder is part of this task.

- [x] Test tampered quote, amount change and expired quote.
- [x] Implement preview with explicit single-pool routing and error/loading states.
- [ ] Run browser checks when a local server is available.

### Task 4: Trading API quote adapter and read-only wallet preview

**Files:** `packages/core/src/trading.ts`, `apps/api/src/trading-api.ts`, `apps/api/src/server.ts`, `apps/web/lib/api.ts`, `apps/web/components/trading-quote-panel.tsx` and adjacent tests.

- [x] Record the user's Trading API selection and current Polygon/router documentation in the spec.
- [x] Reject changed account, token, chain, route, minimum output or stale quote in pure code and API tests.
- [x] Add server-only API key handling and a wallet-bound, read-only quote UI.
- [ ] With a real API key, verify live `CLASSIC` quote shape, fees, quote age, errors and both directions against Uniswap's app.
- [ ] Browser-check account and chain changes on an installed wallet.

The standalone API now has a read-only smoke script and a 5 RPS local scheduler. The smoke attempt could not reach the network; see [live evidence](../../research/2026-09-27-trading-api-live-evidence.md). Implement the detailed [rate-budget plan](2026-09-27-trading-api-rate-budget.md) and [wallet plan](2026-09-27-trading-api-wallet.md) for remaining work.

### Task 5: Approval, Permit2 and unsigned swap preparation

**Files:** `apps/api/src/`, `apps/web/lib/`, `apps/web/components/`, and focused tests. Do not enable the write control before Task 6.

- [ ] Inspect live `/check_approval` calldata, including cancellation cases and allowance amount, before deciding how approval is presented. Stop for a product decision if an unlimited or long-lived approval is required.
- [ ] Bind Permit2 typed-data signature to the exact fresh quote; reject stale signatures or changed accounts.
- [ ] Request `/swap` with the matching quote and signature; validate router `to`, `from`, chain, value, calldata and deadline, then simulate from the wallet.
- [ ] Test wrong chain, insufficient token/gas balance, approval and signature rejection, slippage revert, delayed receipt and reverted receipt.

### Task 6: Release evidence

**Files:** `docs/research/`, `README.md`, `docs/roadmap.md`, CI/browser checks as needed.

- [ ] With a funded disposable Polygon wallet and working RPC, record live quotes in both directions, transaction gas, approval and swap receipts, and rejected/reverted states.
- [ ] Compare representative routes and amounts with the Uniswap app. Enable the write control only if the evidence and review gates pass.
