# Standalone DEX Next Phases Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline. Complete each independently verifiable slice before moving its status. User has authorized routine choices in this session; real wallet actions remain the owner's.

**Goal:** Bring the independent Polygon/Uniswap DEX toward a reviewed standalone swap and LP product without integrating it into the main Vezta repos.

**Architecture:** Keep `apps/web`, `apps/api`, and `packages/core` separated. Trading and liquidity API keys stay server-side. The wallet alone signs and submits. Read-only and mocked work can progress without funded wallet evidence; live writes remain gated.

**Tech Stack:** Node 24, pnpm 10.33.2, TypeScript, Next.js 16, viem, Vitest. Existing [swap spec](../../specs/2026-09-27-trading-api-swap.md), [local rehearsal spec](../../specs/2026-09-29-local-swap-rehearsal-proposal.md), and [roadmap](../../roadmap.md) remain authoritative.

## Constraints and review focus

- Polygon 137, native USDC/WETH, EOA-only local rehearsal, exact ERC20 allowance, Uniswap V2/V3/V4 without hooks for swaps; public `/swap` remains read-only until its release gate passes.
- No main Vezta integration, deployment, agent wallet signature, broadcast, funding, or guessed economic results.
- If UI changes, use the independent `vezta-tokenlaunchpad` frontend as the reference: black canvas, `#D4FF2B` accent, near-square controls, Space Grotesk/JetBrains Mono, responsive wallet states. Validate desktop and mobile before claiming visual parity.
- Treat RPC timeout, stale block, wrong chain, quote expiry, changed allowance, pending nonce, indexer lag, and receipt reorg as fail-closed cases.

## Phase 1 — RPC reliability and diagnosis

- [x] Capture direct read evidence: 4/4 local Trading API quotes succeeded; 3/4 wallet-state reads failed at `getBlock`. Direct RPC probe: `eth_chainId` 5/5 success, `eth_getBlockByNumber` timed out twice at 8 seconds.
- [x] Observe the replacement RPC preflight: 15/15 direct chain and block calls valid; restarted API wallet-state 4/4 HTTP 200, but one state read took 13.1 seconds. Local Trading API quotes were 3/4 HTTP 200 with one 8-second `TRADING_API_TIMEOUT`. See [read evidence](../../research/2026-09-30-intermittent-rehearsal-reads.md).
- [x] Repeat direct Trading API and local reads: both direct quote directions HTTP 200; next two local runs had 8/8 quotes and 8/8 wallet-state reads HTTP 200. Across the three replacement-RPC local runs, state was 12/12 and quote 11/12.
- [ ] Finish qualification of the replacement Polygon RPC with repeated pinned contract-read and receipt checks, and investigate the 13.1-second state tail. Keep wallet preparation fail-closed; do not lengthen the 8-second viem timeout past the 18-second local proxy budget from one sample.
- [ ] Complete desktop browser and pinned/receipt checks after the improved local quote/state preflight; record statuses and latencies, never URL credentials.

## Phase 2 — Local swap completion

- [x] Deterministic mock browser lifecycle and mobile checks were completed by the owner; see [checklist](../../research/2026-09-29-local-wallet-owner-checklist.md).
- [ ] With a stable RPC, the owner checks installed MetaMask connection, account/network changes, rejection, recovery and one capped native-USDC → WETH approval/signature/swap. Record only sanitized transaction evidence.
- [ ] Validate accepted signed calldata and economic receipt against the original intent. Do not promote public write controls from a mock-only result.

## Phase 3 — Reverse swap and public swap gate

- [x] Specify a [separate WETH → USDC funded rehearsal](../../specs/2026-09-30-reverse-swap-rehearsal.md), including WETH allowance, an exact token-unit cap and reverse decimal handling. Do not turn the existing 1-USDC harness into an automatic reverse trade.
- [ ] Complete both-direction live evidence, production finality/replacement policy, shared quote/replay/rate-limit state, abuse controls and independent review before enabling public writes.

## Phase 4 — Liquidity foundation

- [x] Prepare a fixed, read-only `/lp/pool_info` probe with sanitization and tests; local agent network returned `NETWORK`, so this is not live Polygon LP evidence.
- [x] Owner host reached the LP API twice with HTTP 200 and one returned pool, but both responses failed the fixed candidate identity check. Add bounded mismatch diagnostics without accepting an unknown pool; see [LP feasibility](../../research/2026-09-30-lp-api-feasibility.md).
- [x] Localize the observed mismatch to string-typed token decimals and test a narrow validator accepting canonical `"6"`/`"18"` as well as integer 6/18, bound to token order.
- [x] Owner reran the corrected LP pool-info probe: HTTP 200, one pool, identity/state shape and positive active liquidity all matched. Prepared an independent read-only pinned Polygon cross-check with wrong-pool/decimals/reorg tests.
- [x] Record the v3 position identity, read/write boundaries, threat model and UI reference in the [LP design](../../specs/2026-09-30-polygon-v3-lp-design.md); write implementation remains gated.
- [x] Owner ran `node scripts/smoke-lp-onchain.mjs` at Polygon block `94721672` (`2026-09-30T17:00:48.000Z`): `verified:true` and all pinned factory, pool, token, decimal, fee, tick, initialization and liquidity checks passed. This qualifies the candidate for read-only discovery; LP action validation remains open.
- [x] Prepare a bounded, no-wallet shape probe for unsigned Polygon v3 `/lp/create` and `/lp/check_approval`, with sanitization and tests. The probe does not authorize returned calldata.
- [ ] Run the unsigned shape probe on the owner's host; independently decode and validate every returned transaction field before any LP wallet controls. Do not sign or broadcast a probe payload.
- [ ] Obtain an owner-controlled v3 position ID or a verified fork fixture before qualifying unsigned increase, decrease and fee-claim flows; do not infer access from the endpoint documentation.
- [ ] Design chain-aware position ownership, ticks/range, principal, current amounts and uncollected fees separately. Never infer APR or USD TVL from raw `liquidity()`.

## Phase 5 — Standalone product and quality

- [ ] Build LP read/display and write lifecycle only after Phase 4 source and payload checks; add wrong-chain, reversed-token, in/out-of-range, partial/full decrease, rejected signature and lag tests.
- [ ] Align any changed UI with the token launchpad design reference, add normal/loading/empty/error desktop/mobile browser checks, and ensure CI runs tests, typecheck, lint and build.

## Phase 6 — Standalone acceptance and handoff

- [x] Inventory security, data freshness, observability, rate budgets and deployment boundaries in the [standalone release review](../../research/2026-09-30-standalone-release-review.md). Remediation and external evidence in that review remain open; local two-confirmation observation is not a production finality policy.
- [ ] Give the owner one concise checklist of live wallet, RPC, browser and CI checks. Keep Vezta main-site integration outside this plan.
