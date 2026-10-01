# Standalone DEX Demo Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline. User has authorized routine choices; keep real-wallet and external testnet actions separate.

**Goal:** Deliver a self-contained interactive swap and LP workflow demo without real tokens or wallet signatures.

**Architecture:** A pure engine in `apps/web/lib/` owns deterministic integer state and local receipts. A client component renders actions at `/demo`. Existing read-only Polygon and fork test paths remain independent.

**Tech Stack:** TypeScript, React 19, Next.js 16, Vitest. No new dependencies.

**Spec:** [Standalone DEX demo design](../specs/2026-10-01-standalone-dex-demo-design.md).

## Global constraints

- No `fetch`, wallet provider, signer, RPC or real transaction path inside the demo engine/component.
- Label all demo balances, quotes, receipts and fees as simulated. Never call a synthetic figure Uniswap v3 output or APR.
- Retain `/swap` as read-only, `/rehearsal` opt-in, and all public wallet writes disabled.
- Match token-launchpad black/lime/near-square/monospace design. Desktop acceptance now; mobile visual review later.
- Keep the user's existing `apps/web/next-env.d.ts` edit untouched.

## Review focus

- More input than demo balance must reject without changing state.
- Amount or direction change must invalidate a previously reviewed quote.
- Partial decrease must create owed principal; collection must transfer it once, separately from example fees.
- Closing must require zero liquidity and zero owed amounts.
- Reset/reload must leave no pending wallet or transaction state.

### Task 1: Deterministic engine

**Files:** Create `apps/web/lib/demo-engine.ts`; test `apps/web/lib/demo-engine.test.ts`.

**Interface:** Export `initialDemoState()`, `previewDemoSwap(state, direction, amount, slippageBps)`, and transition functions for swap, create, increase, decrease, example-fee credit, collect, close. Return new immutable state plus a simulated receipt; throw a bounded input error on invalid actions. Use `bigint` base units and a fixed 0.05% synthetic fee.

- [x] Write tests for both directions, integer/slippage bounds, non-mutation on failure, and complete LP lifecycle including principal/fee separation.
- [x] Run focused tests and confirm failure.
- [x] Implement the smallest pure engine that passes them.
- [x] Run focused tests and typecheck.

### Task 2: Desktop walkthrough

**Files:** Create `apps/web/components/demo-dex.tsx`, `apps/web/components/demo-dex.test.tsx`, `apps/web/app/demo/page.tsx`; modify `apps/web/app/layout.tsx` and `apps/web/app/globals.css`.

**Interface:** `/demo` renders a visible simulation banner, swap preview/submit, balances, LP actions/position and local action receipt. It has no API calls and resets in memory. Navigation includes Demo.

- [x] Write component tests for labels, preview invalidation, blocked actions, receipt updates and reset.
- [x] Run focused tests and confirm failure.
- [x] Implement the component and styles using the token-launchpad desktop language.
- [x] Run focused tests, typecheck and lint.

### Task 3: Browser and handoff

**Files:** Add a browser smoke script if the existing Playwright CLI can run locally; update `docs/roadmap.md` and add a concise demo runbook under `docs/research/`.

- [x] Record the browser blocker (`listen EPERM` on `127.0.0.1:3020`) and provide exact owner-side browser checks.
- [x] Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; preserve `next-env.d.ts` after build.
- [x] Record which results are simulated, fork verified, and still unverified on testnet/mainnet.
