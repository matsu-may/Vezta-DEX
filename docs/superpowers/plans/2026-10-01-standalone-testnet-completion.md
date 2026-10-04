# Standalone Testnet DEX Completion Roadmap

**Status:** Consolidated roadmap, 2026-10-01. Current update, 2026-10-04: the owner reports all desktop acceptance steps passed; launchpad-style UI refinement is locally qualified. Hosted deployment is a separate follow-up. Earlier status paragraphs below retain their dated implementation evidence. This is the current delivery order for the owner's testnet-first goal. Older Polygon plans retain their historical evidence and open mainnet gates.

**Early demo milestone, 2026-10-02:** follow the [short Explore → wallet swap → receipt roadmap](2026-10-02-early-testnet-demo.md) first. It narrows the first demo to one Base Sepolia pool and bidirectional swaps, then resumes this full six-phase roadmap. Map demo evidence onto Phases 1–3; LP and all remaining acceptance requirements stay open until actually verified. This adds an intermediate milestone, not a replacement plan.

**Goal:** Deliver a reproducible standalone Uniswap DEX demo in `vezta-dex`: pool discovery, same-chain swaps in both directions, and the complete v3 LP position lifecycle on Base Sepolia. Real mainnet USDC and main Vezta integration are later milestones.

**Architecture:** Keep `apps/web`, `apps/api`, `packages/core`. Consume existing deployed Uniswap contracts. Server-only RPC/API configuration; wallet-owned signing/submission. Match the token-launchpad desktop design. Mobile visual polish remains a separate final pass after functional completion.

## Accepted decisions

- Base Sepolia 84532; canonical test USDC/WETH; bounded v3 0.3% candidate pool. Reverify its live identity/depth before execution.
- viem + correctly versioned official artifacts for the narrow SwapRouter02 swap. Prefer `sdk-core`/`v3-sdk` for LP math and position calldata.
- EOA first; swap approvals equal the reviewed input, LP approvals equal the selected input caps with SDK deposits bounded by them. Reset any nonzero differing allowance, confirm receipt and reread before the next approval. Disclose residual LP authorization.
- Keep the 120-second discovery preview separate from 30-second swap quotes and 120-second LP action reviews. Changes of wallet/chain/intent invalidate preparation; fresh immutable rechecks still gate submission.
- No automatic adapter fallback. Universal Router/SDK and hosted API expansion are reviewed after the demo; source clone/submodule and Smart Order Router are added only when justified.
- No Vezta AMM/router/LP-token deployment is needed for this scope. Cross-chain transfers are separate future work.

## Evidence already obtained

Earlier rows retain their historical remaining-gate descriptions; later rows and phase checklists record which gates have since closed.

| Area | Evidence | What remains unproven |
|---|---|---|
| Standalone foundation | Web/API/core, discovery routes, diagnostics, tests and CI workflow exist | Complete testnet product and remote CI execution |
| Wallet-free `/demo` | Simulated swap/LP lifecycle | Uniswap/public-testnet execution; fixture earnings are illustrative |
| Polygon | Live reads/unsigned probes, wallet mocks and owner-operated Anvil LP lifecycle passed | Funded mainnet swaps/LP receipts and public release |
| Base Sepolia discovery | Owner reported qualified live depth, API/web HTTP 200, matching preview/minimum in both directions | Current executable quotes; expiry/refresh/browser smoke acceptance |
| Testnet preparation | Pure swap builder/inspector, exact/reset planner, pinned wallet-bound quote/store and EOA state APIs; pacing fix verified by 562 Vitest +85 Node, typecheck/lint/build and independent review/fix. Owner unfunded state and both post-pacing quote directions passed | Artifact/runtime proof, gas/simulation and executable API/web wiring |
| Router rebuild (2026-10-02) | Exact Solidity 0.7.6 binary hash and 63-source reconstruction independently reproduce all 24,497 historical runtime bytes, including four AST-bound immutables /23 slots | Creation-bytecode proof, other dependency rebuilds, fresh live qualification and execution |
| QuoterV2 rebuild (2026-10-02) | 21 hash-checked sources independently reproduce all 8,273 historical runtime bytes, including two AST-bound immutables /4 slots | Factory/pool/manager rebuilds, creation-bytecode proof, fresh live qualification and execution |
| Factory rebuild (2026-10-02) | 33 hash-checked sources, optimizer 800 and one self-address immutable independently reproduce all 24,535 historical runtime bytes | Pool/manager rebuilds, creation-bytecode proof, fresh live qualification and execution |
| Pool/manager rebuilds (2026-10-02) | Both owner imports and full independent rebuilds passed: 22,142 /24,384 runtime bytes, 7 /5 typed immutables across 27 /17 references. All five historical proofs pass | Fresh live code/configuration/depth, creation-bytecode/proxy gaps, gas/simulation and executable API/web flows |
| Runtime quote gate (2026-10-02) | Owner fresh inventory passed; guarded quotes also passed both directions at 47556679 /47556684 with runtimeVerified:true /executionEnabled:false | Current depth by intent, gas/simulation and executable API/web flows |
| Unsigned approval study (2026-10-02) | Owner unfunded studies passed at 47564799 /47564808 with runtime verified/no transaction; exact/reset/ready and pinned approval simulation implemented | Funded qualification, reset receipts/rereads |
| Fees and swap preparation (2026-10-02) | Complete pinned snapshot fee policy; original minimum/deadline-bound swap simulation, exact allowance and final state checks; owner oracle/unfunded prepare paths passed at 47566198 /47566220 /47566228 | Funded fork/live qualification, final submission recheck and receipt/recovery |
| Funded fork harness (2026-10-02) | Single-command owned Anvil lifecycle implemented; strict receipt, send-boundary and cleanup tests; [current evidence/runbook](../../research/2026-10-02-testnet-fork-lifecycle.md) | Owner funded run accepted at block 47573721; public wallet behavior and actual L1/operator charged fees remain open |
| Recheck and receipt consumers (2026-10-02) | Server-issued original action contexts, once-only final fork boundary, canonical event-bound receipt API and route wiring; [group handoff](../../research/2026-10-02-testnet-recheck-receipt.md) | Owner consumer fork accepted at 47574990; browser controller/recovery and public receipts remain open |

These are separate evidence classes. A fork NFT is not a public-testnet NFT, and a successful mock is not an installed-wallet receipt.

## Phase 1 — Close read-only discovery acceptance

**Status:** Foundation, owner live preview and final desktop discovery mock acceptance are qualified (8 browser checks, 2026-10-02). Public wallet acceptance remains in Phase3.

- [x] Keep the standalone workspace and distinct Polygon/Base Sepolia identities.
- [x] Verify canonical test tokens/pools and record six bounded quotes per candidate at one stable block.
- [x] Expose read-only Base Sepolia discovery and confirm forward/reverse preview and minimum through the owner's host.
- [x] Complete desktop expiry/refresh/error/no-wallet-prompt checks and the existing mocked browser smoke run (updated for the embedded diagnostics panel).

**Exit:** Fresh source/block labels, correct decimals/minimum in both directions, old results cleared on refresh/error, expired previews disabled. No claim that discovery enables execution.

**Owner:** Later run the concise browser checklist; no funded wallet is required. **Dependency:** None. **Likely paths:** existing `/testnet` component/tests and discovery runbook.

## Phase 2 — Qualify executable preparation

**Status:** Runtime proof, owner unfunded approval/preparation acceptance, oracle model access, full snapshot fee policy and unsigned approval/swap APIs are implemented. The owner qualified the disposable funded fork at block 47573721. Final recheck and receipt consumers are implemented; the owner accepted their updated EVM integration at block 47574990. Public wallet/controller acceptance is separate.

- [x] Construct/inspect a single deadline-wrapped swap and one-step exact/reset approval plans.
- [x] Resolve and pin official contract artifacts/source matching the scoped swap deployments. Verify ABI/selectors, router code/configuration, factory/pool, token order/decimals and manager separately.
  - [x] Install exact official packages and fingerprint five artifacts; verify SwapRouter02/Quoter ABI and both swap encodings offline.
  - [x] Obtain the historical stable-block snapshot and independently rebuild all five source/compiler/immutable-bound runtimes (block 47551649).
  - [x] Requalify fresh stable-block code/configuration, scoped swap pool identity/depth and execution-gate consumption. [Current host check](../../research/2026-10-02-testnet-runtime-quote-gate.md) is read-only; historical rebuild success does not enable execution. Creation-bytecode and descriptor proxy implementation/state remain separately recorded gaps.
    - [x] Owner fresh preflight/code inventory passed; enforce five runtime pins in each quote with final freshness/canonical-block checks.
    - [x] Owner runtime-guarded quote path passed in both directions at 47556679 /47556684.
    - [x] Implement bounded complete fee budgets and original-quote unsigned swap preparation.
    - [x] Accept owner unfunded approval studies in both directions.
    - [x] Accept host oracle model access and unfunded preparation paths at blocks 47566198 /47566220 /47566228.
    - [x] Qualify funded gas/simulation with the [one-command disposable fork run](../../research/2026-10-02-testnet-fork-lifecycle.md). Buffered snapshot budgets remain distinct from actual charged public fees.
- [x] Add fresh wallet-bound RPC quotes, opaque stored quote IDs and bounded consumption/replay policy. Recheck impact and full-input-consumption assumptions. Reverse diagnostics confirmed HTTP 429 during dependency reads; origin-shared pacing and bounded response-body reads were added. Owner post-fix host quotes passed in both directions at blocks 47547007 and 47547012.
- [x] Read EOA, balance, gas, pending/mined nonce and allowances at stable blocks; implement reset confirmation/reread and unsigned exact approval preparation.
  - [x] Read EOA, both token/native balances, router allowance and stable mined/pending nonce; return exact/reset/ready kind and distinguish valid unfunded state.
  - [x] Qualify host EOA state evidence (block 47543051); insufficient input balance, no native ETH, and zero allowance reported without a read failure.
  - [x] Implement unsigned exact/reset/ready studies with quote/state binding, real runtime guard, pinned approval simulation and complete buffered snapshot fees; owner funded fork evidence accepted at block 47573721.
  - [x] Accept owner unfunded approval studies at 47564799 /47564808.
  - [x] Qualify sufficient gas estimates and executable approvals with receipt/reset/reread behavior on the disposable fork (47573721); public-testnet acceptance remains separate.
- [x] Simulate/recheck the reviewed swap and expose bounded local API contracts with sanitized errors, deadlines and provenance.
  - [x] Implement original minimum/deadline-bound pinned simulation and unsigned preparation API/CLI with complete fees.
  - [x] Qualify funded simulation/snapshot fees on the disposable fork and implement final one-time recheck/receipt consumers.
  - [x] Accept the updated fork command at block 47574990 with `contextBound:true` and `trackingVerified:true` for every action; retain the earlier funded evidence.

**Exit:** Wrong chain/token/recipient/spender, altered amount/minimum, stale quote, changed allowance/nonce, insufficient balance/gas and failed simulation all block preparation. The API holds no private key and sends no transaction.

**Independent work:** Artifacts, pure/API tests and fork harnesses can progress without owner funding; live RPC/source results still require a reachable provider. **Dependency:** Verified identities from Phase 1. **Likely paths:** core policy, new testnet API quote/state/preparation adapters, scripts and evidence docs; split these into focused implementation plans.

Latest slice: [wallet quote/state spec](../specs/2026-10-01-testnet-wallet-quote.md), [historical owner reads](../../research/2026-10-01-testnet-wallet-read-progress.md) and [runtime gate update](../../research/2026-10-02-testnet-runtime-quote-gate.md). Successful guarded quotes expose `configurationVerified:true`, `runtimeVerified:true`, `executionEnabled:false`; the default API/CLI consumers remain read-only. An explicit localhost-only wallet acceptance consumer is now available through `pnpm dev:testnet`; public receipts remain unobserved.

Follow-through: [fee/preparation spec](../specs/2026-10-02-testnet-fees-swap-preparation.md) and [funded fork group/current host check](../../research/2026-10-02-testnet-fork-lifecycle.md). Earlier no-funds oracle/preparation and funded fork handoffs are accepted. [Current recheck/receipt handoff](../../research/2026-10-02-testnet-recheck-receipt.md) records the accepted updated consumer run at block 47574990. Qualified fees are buffered snapshot estimates, not future fee caps or execution permission. Execution stays disabled by default; the explicit localhost demo consumer is opt-in and still requires owner wallet signatures.

## Phase 3 — Complete testnet wallet swaps

**Status:** Desktop client/proxy/controller/review/recovery are implemented and locally verified (757 Vitest +85 Node, typecheck/lint/build, 15 wallet browser checks). Local `dev:testnet` enables capped owner-operated acceptance; public funded latency, wallet compatibility, receipts and charged fees remain open. [Current group](../../research/2026-10-02-early-demo-browser-session.md) and [owner guide](../../research/2026-10-02-early-testnet-demo-owner-guide.md).

- [x] Wire the explicit local testnet wallet controller into the desktop browser flow: connect/switch chain → fresh quote → exact approval/reset → receipt/reread → simulate/review → submit → verify receipt.
- [x] Implement USDC→WETH and WETH→USDC as separate reviewed intents, including token decimals, expiry, signature rejection and input/account/chain changes.
- [x] Implement original-context storage and explicit headless receipt/hash recovery without automatic rebroadcast. Deterministic tests cover pending/uncertain/reload and reject unverified reorg candidates. Replacement/cancellation identification and API-restart recovery remain unsupported and cannot be claimed from an advanced nonce.
- [x] Qualify deterministic desktop browser and accepted disposable-fork scenarios before enabling localhost opt-in owner-operated execution; mock receipts/recovery and event/current-allowance presentation passed.
- [ ] Reconcile public receipt events, actual spend/output, wallet compatibility, funded quote/recheck latency and actual charged L1/operator fees from the owner run.
- [x] Owner reports both capped public-testnet swap directions passed (2026-10-04). Preserve earlier supplied transaction evidence; new per-direction hashes were not supplied with this confirmation.

**Exit:** Both directions complete with original intent-bound receipts, balance deltas and recovery; cancellation/rejection never appears as success. Mock and fork success are recorded separately from public-testnet success.

**Owner:** Connect MetaMask, obtain test assets, approve/reject/submit the reviewed transactions and supply sanitized hashes/results. **Dependency:** Phase 2. **Likely paths:** testnet wallet controller/storage/client, page UI, receipt API/core and browser/fork scripts. No server-side signing.

## Phase 4 — Complete testnet v3 LP

**Status:** LP foundation remains qualified. Public-wallet studies/controllers, receipt/recovery and desktop controls are implemented, scoped-reviewed and qualified through the actual consumer APIs on disposable fork block 47594852. Public owner acceptance remains open. See [current wallet session](../../research/2026-10-02-testnet-lp-wallet-session.md). See [LP implementation checkpoint](../../research/2026-10-02-base-sepolia-lp-session.md).

- [x] Pin compatible LP SDK packages; qualify the testnet position manager and implement owner-bound pinned NFT reads (unit positive-NFT tests, live empty scan, fork ownership checks).
- [x] Display current principal, range/state, checkpoint fees, mixed stored owed and estimated collectable from pinned reads/math. No inferred APR/TVL.
- [x] Wire public-wallet mint/increase with bounded range/caps/minima/deadline, exact approvals, gas budgets and fresh simulation. Internal unsigned planner and disposable-fork simulation are complete.
- [x] Wire public-wallet partial/full decrease, collect and close/burn. Internal planner and fork qualify principal/fee separation, burn prerequisites, actual pool payments vs nominal manager rounding and cleared residual allowance.
- [x] Add LP rejection, ownership/nonce change, pending, reorg/unverified and original-hash recovery tests. Replacement candidates remain unresolved rather than inferred as success; position reads use the pinned chain directly, without an indexer.
- [x] Run full Base Sepolia lifecycle on disposable fork: foundation block 47587031 and new wallet study/recheck/receipt consumers at 47594852. Reconcile NFT/liquidity/payments, verify restart recovery and cleared allowances, revert snapshot and stop owned child.
- [x] Owner reports mint, increase, partial/full decrease, collect, burn and receipt checks passed (2026-10-04). This closes the owner acceptance checklist on their report; per-action NFT/hash evidence was not independently collected in the UI session.

**Exit:** Create → increase → partial decrease → full decrease → collect → close is reproducible; ownership, liquidity progression, owed/collected amounts, balances and approvals reconcile. Collection is not represented as guaranteed positive fees when no fees accrued.

**Owner:** Later review/sign capped LP actions on their testnet NFT. No preexisting mainnet NFT is required. **Dependency:** Phase 2 policy/state foundation and Phase 3 receipt/recovery patterns. **Likely paths:** core/API LP adapters and math, position/action UI, browser/fork scripts.

## Phase 5 — Assemble the standalone desktop product

**Status:** Desktop recording routes `/demo/1`–`/demo/4`, navigation, Explore/detail and LP controls are locally qualified. Final Vitest 857 pass/one skip, Node 85 pass, full typecheck/lint/build, 30 LP wallet +12 Explore/detail production mocked browser checks, and new wallet fork passed. Public wallet acceptance and remote CI are separate.

- [x] Connect pool discovery/detail, swap and positions/LP into one clearly labeled testnet experience. Keep the Polygon read-only context distinct; do not imply all displayed chains have executable adapters.
- [x] Match token-launchpad desktop branding and verify normal/loading/empty/error/rejected/pending/confirmed states with useful source/freshness and transaction summaries.
- [x] Keep token/pool/router/manager, quote/replay, wallet and receipt identity keyed by chain/adapter. Test cross-chain contamination; this prepares scalability but does not qualify a second executable chain.
- [x] Finish the local-demo access boundary: loopback/same-origin checks, request budgets/rate limits, bounded timeouts, sanitized logs and Base Sepolia dependency readiness. Test single-process restart/lost quote/recovery behavior; shared state is required before replicas.
- [x] Verify local test/typecheck/lint/build and desktop browser flows. Observe remote CI only through an authorized push/PR; document any unobserved external gate.

**Exit:** A reviewer can navigate the complete desktop testnet flow, understand all states and reproduce local checks. Credentials/signatures/raw upstream payloads stay out of logs and frontend bundles. Local readiness is not production approval.

**Owner:** Desktop visual acceptance and any remote publication authorization. **Dependency:** Phases 3–4 functional adapters; UI/operational subparts can proceed earlier. **Likely paths:** existing routes/components/styles, API guards/readiness/logging, CI and runbook.

## Phase 6 — Acceptance and demo handoff

**Status:** Unified [desktop owner guide](../../research/2026-10-02-testnet-desktop-owner-guide.md) and implementation/evidence checkpoint are written. Independent integrated qualification is complete. Owner reports all existing desktop acceptance checks passed on 2026-10-04. The [UI refresh](../../research/2026-10-04-demo-ui-refresh.md) and [hosting handoff](../../research/2026-10-04-vercel-readiness.md) are the current follow-up; new UI visual and hosted-domain acceptance are separate.

- [x] Provide one setup/faucet/command checklist and one acceptance matrix for pool reads, both swaps, LP lifecycle and failure/recovery cases.
- [x] Record actual host/live/fork/browser/CI evidence, versions, supported input ranges and known limitations. Review material findings and rerun relevant gates after fixes.
- [x] Owner reports the desktop guide's wallet/LP/recovery steps all passed (2026-10-04). The refreshed UI still needs a short visual review; actual complete charged fees, remote CI and hosted-domain acceptance remain separate. Mobile polish remains the agreed later pass.
- [x] Preserve standalone boundaries and hand over reproducible local start/reset instructions. Public hosting/production deployment needs its own approval and operational plan.

**Exit:** The accepted demo performs real Uniswap testnet swap and LP operations with verified receipts and clear failure/recovery states. `/demo` can remain as a wallet-free teaching mode. No mainnet or production claim follows automatically.

**Owner:** Final installed-wallet/desktop acceptance. **Dependency:** Phases 1–5. **Verification:** Full local quality gates plus sanitized owner testnet receipts, browser results and explicit CI status.

## Current follow-up — refreshed UI and hosting

The owner accepted all existing test steps on 2026-10-04 and requested a launchpad-style desktop redesign before Vercel preparation. The new UI retains exact approvals, minimums, fee budgets, original-hash recovery and independent transaction review. Run a short visual pass over `/demo/1`–`/demo/4`; do not repeat the complete funded lifecycle without a regression. Hosting requires explicit HTTPS origin/proxy support and persistent backend contexts; a frontend build alone does not enable public wallet execution. See the [Vercel readiness plan](../../research/2026-10-04-vercel-readiness.md).

## Work that can proceed without the owner

Prepare pinned artifacts, deployment probes, quote/state/preparation logic, controller/recovery, SDK LP math, disposable-fork fixtures, mocked browser tests, desktop UI and local controls. Stop owner-dependent checks at wallet signatures, public-testnet funding/receipts or unavailable host services. Do not mark those gates passed from mocks or send a wallet transaction on the owner's behalf.

## Required checkpoint after public desktop demo

Before resuming broader DEX implementation, review this roadmap again against actual accepted swap/LP hashes, wallet compatibility, remaining UX/data gaps and product priorities. Do not treat demo completion as mainnet approval or complete multi-chain execution.

Owner accepts selective official Uniswap reuse: pinned SDK packages for application integration; clone source at pinned commits only for protocol learning, deployment/ABI/calldata comparison, debugging and tests. Add v4-core/v4-periphery when an actual v4/hook adapter needs them. Full AMM fork/deployment is a separate decision requiring its own scope/security review. Preserve the v3 demo and its qualified dependencies; cloning does not resolve wallet transaction compatibility.

Current pre-acceptance correction: [standard-wallet EIP-1559 design](../specs/2026-10-03-testnet-eip1559-design.md) and [implementation plan](2026-10-03-testnet-eip1559.md). New direct type-2 support is separate from wrapped EIP-7702/relayer support. Preserve historical unsupported approvals; disabling wallet settings affects future requests only.

## Later milestones: complete the broader DEX requirement

1. **Mobile polish:** after the functional desktop demo, complete responsive/accessibility/browser acceptance as requested.
2. **Production/mainnet standalone:** qualify real token pairs/depth, hosted API or direct adapter, real-asset policies, finality, access control, quotas, shared state if replicated, metrics, independent security review and deployment/rollback. Real-asset execution is a new owner-operated acceptance gate.
3. **Multi-chain execution and routing:** qualify a second executable chain independently. Review Universal Router/SDK/API by chain, router version and pool needs; add Smart Order Router only if measured multi-pool routing needs justify it. Base Sepolia demo plus Polygon reads do not alone complete multi-chain execution support.
4. **Main Vezta integration:** separate owner-authorized phase for shared auth/wallet/routes/backend API and cross-repo generated contracts. Not part of this standalone demo acceptance. Cross-chain bridging is another separately designed flow.

## Progress references

- [Existing roadmap and historical milestones](../../roadmap.md).
- [Accepted dependency/adapter strategy](2026-10-01-uniswap-dependency-and-adapter-strategy.md).
- [Unsigned testnet foundation](2026-10-01-testnet-swap-calldata.md).
- [Host evidence and browser runbook](../../research/2026-10-01-base-sepolia-testnet-preflight.md).
- [Release gaps](../../research/2026-10-01-roadmap-gap-review.md) and [standalone release inventory](../../research/2026-09-30-standalone-release-review.md); distinguish mainnet/public gates from local demo requirements.
- [Historical router rebuild and next QuoterV2 source action](../../research/2026-10-02-testnet-router-rebuild.md).
- [Historical QuoterV2 rebuild and current factory-source action](../../research/2026-10-02-testnet-quoter-rebuild.md).
- [Historical factory rebuild and current pool/manager source actions](../../research/2026-10-02-testnet-factory-rebuild.md).
- [All-five historical runtime proof and current fresh host checks](../../research/2026-10-02-testnet-pool-manager-rebuild.md).
- [Runtime quote gate and current host command](../../research/2026-10-02-testnet-runtime-quote-gate.md).
- [Unsigned approval study, next host check and remaining gates](../../research/2026-10-02-testnet-unsigned-approval-progress.md).
