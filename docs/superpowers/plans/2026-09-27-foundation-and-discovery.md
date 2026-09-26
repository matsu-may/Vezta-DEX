# Polygon DEX Foundation and Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a standalone, read-only Polygon DEX web app and API that show curated native-USDC/WETH Uniswap v3 pools from current chain reads.

**Architecture:** `packages/core` owns chain-aware IDs and schemas. `apps/api` reads the Polygon v3 factory and pools through a replaceable provider and returns timestamped, validated data. `apps/web` renders `/explore`, `/pools`, and pool detail from the API with explicit loading, unavailable, and stale states. No wallet write is in this slice.

**Tech Stack:** Node 24, TypeScript 5.9, pnpm 10 workspace, Next.js 16/React 19, viem 2, Vitest 4. The dependency versions follow the existing `vezta-fe` installation where possible.

**Spec:** [Foundation and pool discovery](../../specs/2026-09-27-foundation-and-pool-discovery.md); [pool research](../../research/2026-09-27-polygon-weth-usdc.md).

## Global Constraints

- Polygon `chainId` is `137`; token identity is chain ID plus address, never symbol.
- Native USDC is `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals); WETH is `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619` (18 decimals).
- The four researched v3 fee tiers are read-only candidates. The API queries current factory state; it does not publish the September 2026 snapshot as live data.
- Secrets and RPC credentials remain server-side. The browser receives only API responses and public chain metadata.
- No TVL, volume, APR, fee earnings, price impact, or transaction readiness is inferred from raw `liquidity()`.

## Review Focus

1. Unknown chain or malformed pool ID yields a 400/404 response without an RPC call (Task 2 test).
2. A valid address on another chain remains a different token identity (Task 1 test).
3. Factory returns zero address for a fee tier: omit that pool without inventing metrics (Task 2 test).
4. RPC failure or stale timestamp shows an explicit UI state, never an old success silently (Task 3 test).
5. Pool token ordering may differ from display ordering; identify by addresses and preserve fee/pool reference (Task 1 and Task 2 tests).

---

### Task 1: Workspace and shared identities

**Files:** Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/src/index.test.ts`.

**Interfaces:** Export `POLYGON_CHAIN_ID`, `TOKENS`, `V3_FACTORY`, `V3_FEE_TIERS`, `tokenKey(chainId,address)`, `poolKey(chainId,protocol,reference)`, `parsePoolKey(value)` and data types `TokenRecord`, `PoolRecord`.

- [ ] Write tests for chain-aware token/pool identity, reversed display ordering, malformed pool keys, and bridged USDC exclusion; run them to see the expected failure.
- [ ] Implement the smallest registry and parser that pass those tests; run the focused and workspace test commands.
- [ ] Add documented scripts for `dev`, `test`, `typecheck`, `lint`, and `build`; verify dependency installation or record the exact local restriction.

### Task 2: Live Polygon pool API

**Files:** Create `apps/api/package.json`, `apps/api/src/chain.ts`, `apps/api/src/pools.ts`, `apps/api/src/server.ts`, `apps/api/src/pools.test.ts`, `apps/api/src/server.test.ts`, `apps/api/.env.example`.

**Interfaces:** `PoolReader.listCuratedPools(): Promise<PoolRecord[]>`, `PoolReader.getPool(poolKey): Promise<PoolRecord | null>`, HTTP `GET /health`, `GET /api/v1/tokens`, `GET /api/v1/pools`, `GET /api/v1/pools/:poolKey`. Responses carry `source`, `observedAt`, and explicit missing metric fields.

- [ ] Write failing provider and endpoint tests: four fee tiers, zero address, wrong chain/ID, RPC error, token order, source timestamp.
- [ ] Implement viem read-only factory/pool adapter and HTTP validation. Query one current block for a response; never serve snapshot values as live.
- [ ] Run focused tests, API typecheck, and a local HTTP smoke test. Record what cannot be checked without outbound RPC access.

### Task 3: Read-only web routes

**Files:** Create `apps/web/package.json`, `apps/web/app/{layout.tsx,globals.css,page.tsx,explore/page.tsx,pools/page.tsx,pools/[poolId]/page.tsx}`, `apps/web/lib/api.ts`, `apps/web/lib/api.test.ts`, `apps/web/.env.example`, `apps/web/next.config.ts`.

**Interfaces:** `getTokens()`, `getPools()`, `getPool(poolKey)` return typed API data or a controlled error. Routes use the same chain/pool identity as `core`.

- [ ] Write failing API-client tests for success, malformed response, 404, and provider failure; write route behavior checks for unavailable and stale data.
- [ ] Implement server-rendered pages with address, fee, raw active liquidity, source and timestamp; use no made-up financial metrics.
- [ ] Run tests, typecheck, lint and production builds; inspect routes at desktop and mobile widths where browser tooling is available.

### Task 4: Reproducible development gate

**Files:** Create `vezta-dex/.gitignore`, `vezta-dex/.github/workflows/ci.yml`; update `vezta-dex/README.md` and roadmap status.

- [ ] Verify a clean install against the declared lockfile, then run workspace test, typecheck, lint, and build commands.
- [ ] Document environment setup, local ports, how missing RPC/API data appear, and why swap/LP writes remain gated.
- [ ] Add CI with the same commands and no deployment or signing step. Verify workflow syntax and record any environment-limited check.
