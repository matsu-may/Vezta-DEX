# Vezta DEX Roadmap

## Goal and boundaries

Build an independent `vezta-dex/` project using existing Uniswap liquidity on Polygon. Users discover pools, swap, and manage liquidity with their own wallets. Vezta does not deploy an AMM, router, or LP token for the first release. Integrating these routes into the main Vezta frontend and backend is a separate final phase.

**Selected:** Polygon (`chainId` 137), Uniswap, a standalone frontend plus a small server API. **Candidate for investigation:** WETH/USDC. The actual token contracts, pool, Uniswap version, fee tier, and supported trade sizes require live evidence before enabling writes. Uniswap lists Polygon for its Trading API, but chain support alone does not establish pair liquidity. [Supported chains and tokens](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

**Milestone 0 evidence:** [Polygon WETH/native-USDC pool research](research/2026-09-27-polygon-weth-usdc.md) records a v3 0.05% read-only candidate and the checks still required before swap or LP writes.

**Current implementation:** the [foundation plan](superpowers/plans/2026-09-27-foundation-and-discovery.md) is underway. The standalone read-only API and web routes exist; the owner completed a clean dependency installation and live API/RPC probes. Browser checks and CI execution remain to be verified. Milestone 0 and all write gates remain open.

The [Trading API swap spec](specs/2026-09-27-trading-api-swap.md), [rate-budget plan](superpowers/plans/2026-09-27-trading-api-rate-budget.md) and [wallet-flow plan](superpowers/plans/2026-09-27-trading-api-wallet.md) govern the next slices. Read-only QuoterV2 comparison, wallet-bound Trading API quote preview, a bounded single-process quote store, and a single-process 5 RPS limiter exist. The [live API probes](research/2026-09-27-trading-api-live-evidence.md) verified small `CLASSIC` quotes and opaque local quote IDs in both directions; `/check_approval` proposed unlimited ERC20 allowances to Permit2 for both tokens. The owner selected **exact ERC20 approval per swap**, and the read-only approval-plan probe verified zero allowance and exact unsigned plans for both tokens. The [wallet connection validation](research/2026-09-28-wallet-connection-validation.md) records passing browser checks with a mock wallet and instructions for the remaining installed-wallet check. Wallet writes wait for funded-wallet and swap transaction checks.

See [Permit2 standard-policy validation](research/2026-09-28-permit2-standard-policy-validation.md) for the read-only host probe and remaining execution gates.

The next account-specific signing adapter awaits the owner's [initial signer-boundary decision](research/2026-09-28-swap-signer-boundary.md): EOA first, or additional smart-wallet support in the initial slice.

## Delivery sequence

**Routing decision, 2026-09-28:** V2/V3 plus V4 without hooks. Shared policy and response inspection are implemented; the owner verified live compatibility in both directions, exact permit amounts, approximately 30-day Permit2 allowance expiration and 30-minute signature deadline. The owner selected **Permit2 option 1**: exact amount, maximum 30-day remaining allowance lifetime, maximum 30-minute signature deadline, and a separate 30-second quote TTL. A read-only quote-bound Permit2 plan now checks the complete message and a pinned chain nonce; the owner verified live signing plans in both directions at Polygon blocks 94600398 and 94600401. Wallet signing, simulation and receipt gates remain open. See [routing and permit evidence](research/2026-09-28-hook-free-routing-and-permit-policy.md).

| Milestone | Work | Exit evidence |
|---|---|---|
| **0. Pool and integration research** | Verify canonical Polygon token addresses and decimals; compare WETH/USDC pools and quotes at representative sizes; check LP create/increase/decrease/claim support, API access, RPC and data freshness. | A recorded pool selection with source links, quote timestamps, trade sizes, price impact, gas, unsigned LP preparation responses, and explicit unsupported cases. No live-write code depends on an unverified pool. |
| **1. Independent foundation and read-only discovery** | Create `apps/web`, `apps/api`, and a small shared contract package. Add Polygon registry, environment examples, `/explore`, `/pools`, and pool detail using a selected data source. | Local web and API run separately; pool identity includes chain, version and pool ID; stale or missing data is visible; typecheck, lint and data-adapter tests pass. See [first-slice spec](specs/2026-09-27-foundation-and-pool-discovery.md). |
| **2. Same-chain swap** | Add amount entry, fresh quote, approval/Permit2, wallet signature, submission and receipt states. Start with Uniswap AMM routes; add other route types only with their own state model. | Tested wrong chain, decimals, balance/gas, stale quote, rejected signature, slippage revert and delayed receipt. A user can complete a small Polygon swap manually after reviewing the transaction. |
| **3. Liquidity positions** | Add position discovery, create, increase, decrease, claim fees and close for the selected Uniswap pool version. | Position values and fees match the chosen protocol source; in-range/out-of-range, partial withdrawal, rejected signature and indexer lag are tested. |
| **4. Standalone release** | Add browser tests, observability, rate limits, CI, runbook and deployment configuration. | A reviewer can reproduce the full wallet flows and see test/build results; secrets stay server-side. Production launch requires separate review. |
| **5. Vezta integration** | Decide whether to move or proxy routes; connect to Vezta auth, wallet, brand and backend API without changing transaction ownership. | `vezta.io/swap`, `/explore`, `/pools` share one user and wallet experience with the main app; cross-repo API changes are generated and tested. |

## Implementation rhythm with Superpowers

Keep this roadmap stable at the milestone level. For each milestone, review a focused design/spec, write an implementation plan with small verifiable tasks, implement one slice at a time, and verify actual commands and wallet behavior before calling it complete. Record discoveries that change scope in the relevant spec; do not silently broaden a slice. The first plan follows review of the [foundation and discovery spec](specs/2026-09-27-foundation-and-pool-discovery.md).

Use Vezta's `dex-threat-model` before new signing or data boundaries, `dex-chain-data` for chain/pool identity, `dex-swap-flow` for milestone 2, and `dex-lp-position` for milestone 3. Foundry and Slither become relevant only if Vezta later maintains its own Solidity.

## Decisions reserved for milestone 0

- Exact native USDC and WETH contracts, and whether any bridged token is excluded from the curated list.
- Uniswap v3 or v4 pool ID, fee configuration and position model for the first LP workflow.
- Representative trade sizes and the maximum acceptable price impact for the target users.
- Production data source for pool ranking, volume and positions; freshness and outage behavior.
- Trading and Liquidity API access, rate limits and supported Polygon actions. If a required action is unavailable, compare an SDK/RPC adapter before committing to it.

These are evidence gates, not open-ended feature requests. Read-only scaffolding can use clearly labeled fixtures while live access is being arranged, but milestone 1 exits only after a real data source is verified. Writes stay disabled until their gates pass.
