# Base Sepolia LP implementation plan

**Goal:** Add verified LP reads, unsigned lifecycle preparation, a disposable fork qualification and recording route `/demo/2`.
**Architecture:** API owns RPC and pinned runtime/state qualification; pinned Uniswap SDK owns LP math/calldata; core owns strict wire schemas; web validates responses and renders a read-only recording workspace. Public writes remain disabled.
**Tech Stack:** TypeScript, viem 2.47.18, sdk-core 7.19.4, v3-sdk 3.31.5, Zod, Next.js, Vitest, Playwright, Anvil.
**Spec:** `docs/superpowers/specs/2026-10-02-base-sepolia-lp.md`.
**Global Constraints:** Same-chain 84532; fixed USDC/WETH 3000 pool/manager; no owner funds or public writes, no integration or mainnet; preserve owner next-env edit; reuse historical qualification.
**Review Focus:** Fee growth wraps at uint256; stored owed mixes fees/principal; page cursors must bind block; burn and approval limits must fail closed; RPC errors must remain secret-safe.

## Task 1: Pinned LP reads and math

Interfaces: `packages/core/src/testnet-lp.ts` exports strict request/page schemas and parsers. `apps/api/src/testnet-lp-position.ts` exports `TestnetLpPositionReader.read(unknown)`; source adds manager enumeration/positions, pool tick and fee-growth reads. Page contains block hash/time, owner, cursor, next cursor, current principal, new checkpoint fees and mixed owed/collectable amounts.

Write failing tests for fresh/empty/filtered/partial pages, wrong owner/chain/runtime/pool, malformed ticks, stale/reorg scan, wraparound and zero liquidity. Implement bounded reader and source; fixed POST `/api/v1/testnet/base-sepolia/lp/positions`. Expected: focused Vitest passes; all contract reads use pinned block.

## Task 2: Unsigned lifecycle planner

Interface: `apps/api/src/testnet-lp-plan.ts` exports validated SDK-backed plan generation for mint/increase/decrease/collect/burn, with independent calldata review and exact manager approval plans. Preparation does not enable broadcast.

Write failing tests for tick order/spacing, caps/minimums, recipient, ownership, collect vs principal, reset/exact approvals and burn preconditions. Implement and run focused Vitest. Expected: only permitted calls and zero native value are returned.

## Task 3: Disposable Base Sepolia LP qualification

Reuse owned Anvil launch/guard, fixture funding and snapshot cleanup. Add `testnet:lp-fork`, perform exact approvals, mint, increase, partial/full decrease, collect, clear residual allowances and burn. Verify receipt status, NFT owner/pool, liquidity progression and ERC20 balance deltas. No public endpoint can receive sends. Expected: verified lifecycle and snapshot reverted; unavailable upstream remains explicitly unqualified.

## Task 4: `/demo/2` and handoff

Add a bounded fixed-origin proxy and strictly parsed response, explicit address input, pinned-page scanning and clear data labels. Test errors, empty/partial reads and late request suppression; mock desktop browser; visual inspection. Public actions stay visibly disabled pending wallet integration. Link swap/LP recording routes.

Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` once at completion (preserve next-env); fresh final review; document results, choices, next work and owner checks. Commit only scoped files, no push. Expected: green gates or a precise blocking report with remaining work.
