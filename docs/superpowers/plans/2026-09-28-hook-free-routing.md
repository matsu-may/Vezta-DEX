# Hook-free Uniswap Routing Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` and TDD. The owner selected option A on 2026-09-28; no further routing-scope decision is required.

**Goal:** Request V2/V3/V4 quotes with `V4_NO_HOOKS` and reject responses outside that policy before storing or displaying them.

**Architecture:** One dependency-free core module owns the request policy and route inspection. The API and Node 24 smoke script use it. API errors remain generic; neither raw route nor permit data is exposed to the browser.

**Spec:** [Trading API swap spec](../../specs/2026-09-27-trading-api-swap.md).

## Constraints and review focus

- Polygon 137, native USDC/WETH, exact input, CLASSIC and router 2.1.2 remain fixed.
- Protocols V2/V3/V4; `hooksOptions: V4_NO_HOOKS`. No fallback to inclusive hooks.
- Inspect every branch and hop, including split/mixed routes. Require supported pool type, pool reference, Polygon currency identities, connected path and matching endpoints.
- V4 requires an explicit zero `hooks` address. Missing, malformed or nonzero hooks fail closed. Unexpected nonzero hook metadata on V2/V3 also fails.
- Currency conversion edges omitted from upstream metadata are unsupported when they break path continuity; do not infer missing wrap steps.
- This validates quote metadata, not contract provenance or executable calldata. Wallet writes remain gated.

### Task 1: Shared policy and route inspector

**Files:** `packages/core/src/trading-route.ts`, adjacent test and `index.ts`.

**Interface:** `inspectTradingRoute(route: unknown, intent: {chainId:number; tokenIn:string; tokenOut:string}): {pathCount:number; poolCount:number; v4PoolCount:number}`; exported `TRADING_ROUTING_POLICY`.

- [x] Test valid V2/V3/V4, split/mixed paths, nonzero/missing hooks, unknown types, missing references, wrong chains and disconnected paths; observed missing-module RED.
- [x] Implement bounded inspection (at most 32 branches and 16 hops per branch); 27 focused tests passed.

### Task 2: API and smoke integration

**Files:** `apps/api/src/trading-api.ts`, its test, server test fixture, `scripts/smoke-trading-api.mjs`.

- [x] Test explicit request policy and rejection before quote storage; observed two failing tests before implementation.
- [x] Inspect raw quote routes before store save; preserve generic error behavior. Core/API/server focused run: 42 passed.
- [x] Use the shared policy in the direct smoke script and print only inspection counts/status. Node 24 direct import verified.

### Task 3: Verification and evidence

**Files:** spec, architecture, roadmap, README and research evidence.

- [x] Run full tests, typecheck, lint, build and independent DEX review; no route review blocker.
- [x] Attempt a sanitized live smoke check; network TypeError before HTTP response, recorded accurately.
- [x] Record the selected policy and remaining live/installed-wallet gates in the verified slice.

## Next decision boundary

Added read-only Permit2 diagnostics and five Node tests to measure allowance expiry separately from signature deadline, including zero-expiration semantics. Final suite: 104 Vitest + 8 Node tests passed. Production signing/preparation remains paused for the owner's duration policy. This extension does not alter allowances or sign/send transactions.
