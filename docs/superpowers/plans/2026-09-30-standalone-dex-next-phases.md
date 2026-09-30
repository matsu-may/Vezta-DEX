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
- [ ] Qualify a dependable Polygon RPC endpoint with repeated block, pinned contract-read and receipt checks. Keep the currently configured endpoint fail-closed until an alternative is measured. Do not lengthen the 8-second viem timeout past the 18-second local proxy budget.
- [ ] Rerun local quote/state and desktop browser checks after a qualified endpoint is configured; record statuses and latencies, never URL credentials.

## Phase 2 — Local swap completion

- [x] Deterministic mock browser lifecycle and mobile checks were completed by the owner; see [checklist](../../research/2026-09-29-local-wallet-owner-checklist.md).
- [ ] With a stable RPC, the owner checks installed MetaMask connection, account/network changes, rejection, recovery and one capped native-USDC → WETH approval/signature/swap. Record only sanitized transaction evidence.
- [ ] Validate accepted signed calldata and economic receipt against the original intent. Do not promote public write controls from a mock-only result.

## Phase 3 — Reverse swap and public swap gate

- [ ] Specify a separate WETH → USDC funded rehearsal, including WETH allowance and reverse token amounts. Do not turn the existing 1-USDC harness into an automatic reverse trade.
- [ ] Complete both-direction live evidence, production finality/replacement policy, shared quote/replay/rate-limit state, abuse controls and independent review before enabling public writes.

## Phase 4 — Liquidity foundation

- [x] Prepare a fixed, read-only `/lp/pool_info` probe with sanitization and tests; local agent network returned `NETWORK`, so this is not live Polygon LP evidence.
- [x] Record the v3 position identity, read/write boundaries, threat model and UI reference in the [LP design](../../specs/2026-09-30-polygon-v3-lp-design.md); write implementation remains gated.
- [ ] Confirm Polygon native-USDC/WETH v3 pool identity and LP API `/lp/pool_info` read access with a sanitized, read-only probe. The v3 0.05% pool is a candidate, not an approved LP target.
- [ ] Verify Polygon unsigned `/lp/check_approval`, `/lp/create`, `/lp/increase`, `/lp/decrease` and `/lp/claim_fees` responses before building write controls. Use the official [LP integration guide](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/integration-guide) and [Polygon v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments).
- [ ] Design chain-aware position ownership, ticks/range, principal, current amounts and uncollected fees separately. Never infer APR or USD TVL from raw `liquidity()`.

## Phase 5 — Standalone product and quality

- [ ] Build LP read/display and write lifecycle only after Phase 4 source and payload checks; add wrong-chain, reversed-token, in/out-of-range, partial/full decrease, rejected signature and lag tests.
- [ ] Align any changed UI with the token launchpad design reference, add normal/loading/empty/error desktop/mobile browser checks, and ensure CI runs tests, typecheck, lint and build.

## Phase 6 — Standalone acceptance and handoff

- [ ] Review security, data freshness, observability, rate budgets and deployment configuration. Record exact commands and results; do not call local two-confirmation observation a production finality policy.
- [ ] Give the owner one concise checklist of live wallet, RPC, browser and CI checks. Keep Vezta main-site integration outside this plan.
