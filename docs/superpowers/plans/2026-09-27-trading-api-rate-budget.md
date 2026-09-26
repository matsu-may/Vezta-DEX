# Trading API Rate Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the standalone API's use of one Uniswap key within a conservative five-request-per-second budget.

**Architecture:** One in-memory scheduler spaces outbound dispatches and prioritizes transaction preparation over previews. A shared transport owns authentication and observes 429 responses. The quote reader uses that transport; future approval/swap adapters must use the same instance.

**Tech Stack:** TypeScript, Node fetch, Vitest.

**Spec:** [Trading API swap design](../../specs/2026-09-27-trading-api-swap.md).

## Global Constraints

- User key: 6 RPS; local target: 5 RPS, minimum 200 ms between dispatches, no burst.
- Queue cap: 20 waiting requests. Approval/swap preparation wins over queued previews, never over in-flight calls.
- HTTP 429 pauses every endpoint using this key; no automatic replay of signed requests.
- One process only; distributed limiting is a deployment gate.

## Review Focus

1. Concurrent previews at the same timestamp dispatch at least 200 ms apart — Task 1 test.
2. A queued execution request passes older queued previews — Task 1 test.
3. Twenty waiting jobs produce a controlled saturation error on the next enqueue — Task 1 test.
4. An in-flight 429 pauses all queued work according to Retry-After — Task 2 test.
5. API key or raw upstream error does not appear in client response — Task 3 test.

---

### Task 1: Shared scheduler

**Files:** Create `apps/api/src/trading-rate-limit.ts`, `apps/api/src/trading-rate-limit.test.ts`.

**Interfaces:** `TradingApiRateLimiter.schedule<T>(task: () => Promise<T>, priority?: "preview" | "execution"): Promise<T>`, `pauseFor(milliseconds: number): void`, `TradingApiQueueFullError`.

- [x] Write tests for spacing, priority and queue cap with Vitest fake timers.
- [x] Run `pnpm exec vitest run apps/api/src/trading-rate-limit.test.ts`; observed missing module failure.
- [x] Implement one timer and FIFO queues by priority. Update next dispatch from actual dispatch time.
- [x] Rerun focused test; passed.

### Task 2: Transport and 429 pause

**Files:** Create `apps/api/src/trading-client.ts`, `apps/api/src/trading-client.test.ts`; modify `apps/api/src/trading-api.ts`.

**Interfaces:** `TradingApiClient.post(path: "/quote" | "/check_approval" | "/swap", body: unknown, priority: "preview" | "execution"): Promise<Response>`.

- [x] Write tests proving shared spacing and 429 `Retry-After` pause across paths, with no automatic retry.
- [x] Run focused tests; observed missing client failure.
- [x] Move key/header/fetch logic into the client; make the quote reader call `post("/quote", ...)`.
- [x] Rerun focused and full `pnpm test`; passed.

### Task 3: API integration and verification

**Files:** Modify `apps/api/src/main.ts`, `apps/api/src/server.ts`, tests as required; update `docs/research/2026-09-27-trading-api-live-evidence.md`.

- [x] Add a server test for upstream 429 returning a generic unavailable response without credential leakage. Queue saturation is covered at the scheduler boundary.
- [x] Construct one transport in `main.ts` and inject it into the quote reader; the handler maps errors to generic 503.
- [x] Run `pnpm test` (49 passing), `pnpm typecheck`, ESLint 9 and `pnpm build` after final edits; all passed locally. The limiter is single-process; shared infrastructure remains a public-deployment gate.
