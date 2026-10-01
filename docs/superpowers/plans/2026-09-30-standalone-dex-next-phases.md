# Standalone DEX Next Phases Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline. Complete each independently verifiable slice before moving its status. User has authorized routine choices in this session; real wallet actions remain the owner's.

**Goal:** Bring the independent Polygon/Uniswap DEX toward a reviewed standalone swap and LP product without integrating it into the main Vezta repos.

**Architecture:** Keep `apps/web`, `apps/api`, and `packages/core` separated. Trading and liquidity API keys stay server-side. The wallet alone signs and submits. Read-only and mocked work can progress without funded wallet evidence; live writes remain gated.

**Tech Stack:** Node 24, pnpm 10.33.2, TypeScript, Next.js 16, viem, Vitest. Existing [swap spec](../../specs/2026-09-27-trading-api-swap.md), [local rehearsal spec](../../specs/2026-09-29-local-swap-rehearsal-proposal.md), and [roadmap](../../roadmap.md) remain authoritative.

## Constraints and review focus

- Polygon 137, native USDC/WETH, EOA-only local rehearsal, exact ERC20 allowance, Uniswap V2/V3/V4 without hooks for swaps; public `/swap` remains read-only until its release gate passes.
- No main Vezta integration, deployment, agent wallet signature, broadcast, funding, or guessed economic results.
- If UI changes, use the independent `vezta-tokenlaunchpad` frontend as the reference: black canvas, `#D4FF2B` accent, near-square controls, Space Grotesk/JetBrains Mono. Validate desktop now; defer mobile visual acceptance until the complete standalone product is ready.
- Treat RPC timeout, stale block, wrong chain, quote expiry, changed allowance, pending nonce, indexer lag, and receipt reorg as fail-closed cases.

## Phase 1 — RPC reliability and diagnosis

- [x] Capture direct read evidence: 4/4 local Trading API quotes succeeded; 3/4 wallet-state reads failed at `getBlock`. Direct RPC probe: `eth_chainId` 5/5 success, `eth_getBlockByNumber` timed out twice at 8 seconds.
- [x] Observe the replacement RPC preflight: 15/15 direct chain and block calls valid; restarted API wallet-state 4/4 HTTP 200, but one state read took 13.1 seconds. Local Trading API quotes were 3/4 HTTP 200 with one 8-second `TRADING_API_TIMEOUT`. See [read evidence](../../research/2026-09-30-intermittent-rehearsal-reads.md).
- [x] Repeat direct Trading API and local reads: both direct quote directions HTTP 200; next two local runs had 8/8 quotes and 8/8 wallet-state reads HTTP 200. Across the three replacement-RPC local runs, state was 12/12 and quote 11/12.
- [x] Prepare a sanitized read-only RPC qualification probe for a fresh Polygon block, pinned USDC balance/allowance calls, an existing transaction receipt and repeated block-hash confirmation. The owner ran it on the host: 3/3 cycles `verified:true`, with complete-cycle durations of 2,196, 1,986 and 1,908 ms; all individual calls were at most 553 ms in this sample.
- [x] Add a local read-only wallet-state diagnostic that times the actual source methods, including parallel balance/allowance/nonce reads and optional approval simulation/gas, without returning balances, addresses, calldata or provider errors. The owner ran it: 3/3 complete cycles returned `ok` in 4,924, 788 and 795 ms. In the first cycle `getBlock` took 2,683 ms and the slowest parallel read took 1,856 ms; simulation/gas calls were 69–70 ms. No errors occurred.
- [ ] Continue availability and tail-latency measurements. The earlier 13.1-second wallet-state tail did not recur in the three method-level cycles; its cause is still unproven. The successful pinned/receipt cycles close that read-shape gate, not a long-term reliability or production-SLA gate. Keep wallet preparation fail-closed; do not lengthen the 8-second viem timeout past the 18-second local proxy budget from one sample.
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
- [x] Resolve unsigned `/lp/create` value encoding: owner host confirmed HTTP 200, token amounts, chain, wallet, position-manager target and calldata shape; `valueKind` was `zero-hex`. The bounded probe now accepts decimal or hex zero and still rejects positive native value.
- [x] Owner host returned HTTP 200 and `shapeValid:true` for unsigned `/lp/create` and `/lp/check_approval`; approval returned two transaction envelopes. This does not qualify their calldata.
- [x] Add a local, sanitized decoder for direct v3 mint and ERC20 approval payloads, with tests for wrong recipient, excess input, wrong spender and unlimited allowance. Unknown create selectors remain unqualified.
- [x] Owner's decoded run found a direct v3 `mint` with correct pair, fee, ticks, minima, recipient and deadline, but desired amounts did not match API response token amounts. Both returned approvals are unlimited to the correct manager. Added bounded per-token difference diagnostics; mismatched mint and unlimited approvals still fail closed.
- [x] Owner's bounded rerun found decoded USDC desired amount equal to the 1-USDC input and WETH desired amount below the API's dependent amount by less than 0.5%. Added a local conservative mint input policy requiring exactly 1 USDC, positive WETH no higher than the displayed dependent amount with at most 0.5% difference, and minima within 0.5% of the displayed amounts. Larger/different inputs and compounded slippage remain rejected.
- [x] Owner reran the revised mint validator: `decodedChecksPassed:true`, including exact 1-USDC cap, bounded WETH maximum, displayed-amount minima, recipient and deadline. This qualifies only the returned unsigned mint semantics; no simulation or wallet action occurred.
- [x] Add a read-only pinned-block allowance probe for both tokens to the v3 manager, and a pure exact-approval planner that uses validated mint maxima plus an independent user-reviewed WETH cap. Unit tests cover zero/exact/standing allowances, wrong mint, missing/low WETH cap, reorg, stale block and provider failure. Neither is connected to a wallet.
- [x] Owner ran `scripts/smoke-lp-allowances.mjs` for the same EOA: at block `94725298` (`2026-09-30T18:31:27.000Z`), fresh/stable block, EOA and allowance shapes passed; USDC and WETH allowances to the manager were both zero. This is a snapshot, not a wallet-write gate.
- [x] Add a separate read-only pinned-block LP wallet-state probe for USDC/WETH/POL balances and mined-versus-pending nonce. It reports bounded funding flags and fails closed on stale/reorganized blocks or a pending nonce; it does not simulate or sign.
- [x] Owner ran `scripts/smoke-lp-wallet-state.mjs` for the same EOA: at block `94725882` (`2026-09-30T18:46:03.000Z`), fresh/stable block, EOA, balance shapes and mined/pending nonce checks all passed; USDC ≥1, WETH >0 and POL >0 were all false. This is a valid read of an unfunded wallet, not an LP wallet-write gate.
- [x] Add bounded read-only owner-NFT pagination for the fixed Polygon v3 pool and a disposable Anvil fork preflight. The position endpoint pins and confirms the block and returns no fee/amount estimates; the fork probe requires exact source/fork block identity and repeats the pool checks. Local unit tests pass; the agent's upstream RPC access returned `FORK_UNAVAILABLE` before Anvil could start. See [research](../../research/2026-10-01-lp-position-and-fork.md).
- [x] Owner host verified the read-only Anvil preflight at block `94738219`: same Polygon chain, Anvil client, exact source block number/hash, fresh source and independently verified v3 pool all passed. This is separate from approval/mint simulation.
- [x] Implement a disposable local-fork mint harness behind the verified preflight: fixed 1-USDC unsigned create, 0.001-WETH local fixture cap, zero starting balances/allowances, exact local approvals, gas/simulation, receipt/NFT/balance/allowance review. Unit tests pass; only Anvil-local transactions are allowed. See [fork research](../../research/2026-10-01-lp-position-and-fork.md).
- [x] Owner host ran the local-fork mint harness at block `94738685`: preflight, exact local approvals, simulation, gas bound, mint receipt, NFT owner/pool/liquidity, token balance deltas and residual allowances all passed. This does not qualify real-wallet LP controls or true market economics because the local fixture moves pool balances.
- [x] Owner ran direct v3 manager increase, partial/full decrease, collect and close on a disposable Anvil fork at Polygon source block `94746016`. Exact reapprovals, bounded spend, owed-token accounting, owner/liquidity, receipts, wallet collection deltas, cleared residual allowances and NFT burn all returned `true`. This qualifies only local contract-level wiring, not hosted LP API responses or real-market economics.
- [ ] Obtain an owner-controlled Polygon v3 position ID before qualifying LP API increase, decrease and fee-claim flows. The verified fork NFT exists only on disposable Anvil, while Uniswap's hosted LP API reads Polygon; do not substitute the fork token ID or another owner's position.
- [ ] Decode and simulate each hosted LP action separately; verify any bundled collection, exact input caps, remaining allowances, replacement/reorg recovery and actual wallet deltas before connecting wallet controls.
- [ ] Design chain-aware position ownership, ticks/range, principal, current amounts and uncollected fees separately. Never infer APR or USD TVL from raw `liquidity()`.

## Phase 5 — Standalone product and quality

- [x] Add a read-only `/positions` view for the fixed Polygon v3 pool. Validate owner/manager/pool binding, bounded pagination and unsupported economics at the frontend boundary; show empty/loading/error and current/stale states. No LP wallet control is exposed. Component and API tests pass. The owner confirmed “No positions owned” for an empty wallet after the response-envelope fix; matching-NFT and mobile browser checks remain open.
- [ ] Complete verified position amount/fee displays and the LP write lifecycle after Phase 4 source and payload checks; add wrong-chain, reversed-token, in/out-of-range, partial/full decrease, rejected signature and lag tests.
- [ ] Align any changed UI with the token launchpad design reference and add normal/loading/empty/error desktop browser checks. Mobile visual acceptance is deferred to final standalone acceptance. Ensure CI runs tests, typecheck, lint and build.

## Phase 6 — Standalone acceptance and handoff

- [x] Inventory security, data freshness, observability, rate budgets and deployment boundaries in the [standalone release review](../../research/2026-09-30-standalone-release-review.md). Remediation and external evidence in that review remain open; local two-confirmation observation is not a production finality policy.
- [x] Restrict the standalone API listener to literal `127.0.0.1` until direct preparation endpoints have access control. Tests cover wildcard, IPv6, LAN and hostname binds. This is a local-process guard, not protection against a public reverse proxy.
- [ ] Give the owner one concise checklist of live wallet, RPC, browser and CI checks. Keep Vezta main-site integration outside this plan.
- [ ] Close the operational gates in the [roadmap gap review](../../research/2026-10-01-roadmap-gap-review.md): access control, shared quotas/state, readiness/telemetry, LP recovery and fee accounting. Validate mobile presentation only after complete standalone flows are ready.
- [ ] Plan standalone multi-chain adapters and qualify a second chain separately after the Polygon flow is stable; do not fold cross-chain transfers into the first release.
