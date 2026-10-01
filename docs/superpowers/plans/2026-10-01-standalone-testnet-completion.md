# Standalone Testnet DEX Completion Roadmap

**Status:** Consolidated roadmap, 2026-10-01, updated after the wallet quote/state slice. This is the current delivery order for the owner's testnet-first goal. Older Polygon plans retain their historical evidence and open mainnet gates.

**Goal:** Deliver a reproducible standalone Uniswap DEX demo in `vezta-dex`: pool discovery, same-chain swaps in both directions, and the complete v3 LP position lifecycle on Base Sepolia. Real mainnet USDC and main Vezta integration are later milestones.

**Architecture:** Keep `apps/web`, `apps/api`, `packages/core`. Consume existing deployed Uniswap contracts. Server-only RPC/API configuration; wallet-owned signing/submission. Match the token-launchpad desktop design. Mobile visual polish remains a separate final pass after functional completion.

## Accepted decisions

- Base Sepolia 84532; canonical test USDC/WETH; bounded v3 0.3% candidate pool. Reverify its live identity/depth before execution.
- viem + correctly versioned official artifacts for the narrow SwapRouter02 swap. Prefer `sdk-core`/`v3-sdk` for LP math and position calldata.
- EOA first; exact token approvals. Reset any nonzero differing allowance, confirm receipt and reread before the next exact approval.
- Keep the 120-second discovery preview separate from authentic 30-second execution quotes. Changes of wallet/chain/intent invalidate preparation.
- No automatic adapter fallback. Universal Router/SDK and hosted API expansion are reviewed after the demo; source clone/submodule and Smart Order Router are added only when justified.
- No Vezta AMM/router/LP-token deployment is needed for this scope. Cross-chain transfers are separate future work.

## Evidence already obtained

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

These are separate evidence classes. A fork NFT is not a public-testnet NFT, and a successful mock is not an installed-wallet receipt.

## Phase 1 — Close read-only discovery acceptance

**Status:** Foundation and owner live preview evidence exist; final browser acceptance remains open.

- [x] Keep the standalone workspace and distinct Polygon/Base Sepolia identities.
- [x] Verify canonical test tokens/pools and record six bounded quotes per candidate at one stable block.
- [x] Expose read-only Base Sepolia discovery and confirm forward/reverse preview and minimum through the owner's host.
- [ ] Complete desktop expiry/refresh/error/no-wallet-prompt checks and the existing mocked browser smoke run.

**Exit:** Fresh source/block labels, correct decimals/minimum in both directions, old results cleared on refresh/error, expired previews disabled. No claim that discovery enables execution.

**Owner:** Later run the concise browser checklist; no funded wallet is required. **Dependency:** None. **Likely paths:** existing `/testnet` component/tests and discovery runbook.

## Phase 2 — Qualify executable preparation

**Status:** Pure core policy and read-only wallet-bound quote/state APIs are implemented; live qualification and executable preparation remain incomplete.

- [x] Construct/inspect a single deadline-wrapped swap and one-step exact/reset approval plans.
- [ ] Resolve and pin official contract artifacts/source matching deployments. Verify ABI/selectors, router code/configuration, factory/pool, token order/decimals and manager separately.
  - [x] Install exact official packages and fingerprint five artifacts; verify SwapRouter02/Quoter ABI and both swap encodings offline.
  - [ ] Obtain live stable-block runtime snapshot, then independently qualify source/compiler/immutables; see [one-command host check](../../research/2026-10-01-testnet-artifact-progress.md).
    - Source graph acquisition/cache and optional snapshot binding are implemented; [two host commands](../../research/2026-10-01-testnet-source-progress.md) prepare real inputs. Independent compilation remains open.
- [x] Add fresh wallet-bound RPC quotes, opaque stored quote IDs and bounded consumption/replay policy. Recheck impact and full-input-consumption assumptions. Reverse diagnostics confirmed HTTP 429 during dependency reads; origin-shared pacing and bounded response-body reads were added. Owner post-fix host quotes passed in both directions at blocks 47547007 and 47547012.
- [ ] Read EOA, balance, gas, pending/mined nonce and allowances at stable blocks; implement reset confirmation/reread and unsigned exact approval preparation.
  - [x] Read EOA, both token/native balances, router allowance and stable mined/pending nonce; return exact/reset/ready kind and distinguish valid unfunded state.
  - [x] Qualify host EOA state evidence (block 47543051); insufficient input balance, no native ETH, and zero allowance reported without a read failure.
  - [ ] Qualify sufficient gas estimates and executable approvals with receipt/reset/reread behavior.
- [ ] Simulate/recheck the reviewed swap and expose bounded local API contracts with sanitized errors, deadlines and provenance.

**Exit:** Wrong chain/token/recipient/spender, altered amount/minimum, stale quote, changed allowance/nonce, insufficient balance/gas and failed simulation all block preparation. The API holds no private key and sends no transaction.

**Independent work:** Artifacts, pure/API tests and fork harnesses can progress without owner funding; live RPC/source results still require a reachable provider. **Dependency:** Verified identities from Phase 1. **Likely paths:** core policy, new testnet API quote/state/preparation adapters, scripts and evidence docs; split these into focused implementation plans.

Latest slice: [wallet quote/state spec](../specs/2026-10-01-testnet-wallet-quote.md) and [owner checks/progress](../../research/2026-10-01-testnet-wallet-read-progress.md). Quotes expose `configurationVerified:true`, `runtimeVerified:false`, `executionEnabled:false`; no public-testnet execution consumer has been enabled.

## Phase 3 — Complete testnet wallet swaps

**Status:** Not complete; current `/testnet` has no execution consumer.

- [ ] Build an explicit local testnet wallet controller: connect/switch chain → fresh quote → exact approval/reset → receipt/reread → simulate/review → submit → verify receipt.
- [ ] Implement USDC→WETH and WETH→USDC as separate reviewed intents, including token decimals, expiry, signature rejection and input/account/chain changes.
- [ ] Persist original submission context; handle pending, uncertain submission, reload, replacement and reorg without automatic rebroadcast.
- [ ] Qualify deterministic browser and disposable-fork scenarios before enabling owner-operated testnet execution; reconcile successful receipt events, actual spend/output, gas and remaining allowance.
- [ ] Obtain owner-operated capped public-testnet evidence for both directions using faucet test ETH/USDC and resulting WETH.

**Exit:** Both directions complete with original intent-bound receipts, balance deltas and recovery; cancellation/rejection never appears as success. Mock and fork success are recorded separately from public-testnet success.

**Owner:** Connect MetaMask, obtain test assets, approve/reject/submit the reviewed transactions and supply sanitized hashes/results. **Dependency:** Phase 2. **Likely paths:** testnet wallet controller/storage/client, page UI, receipt API/core and browser/fork scripts. No server-side signing.

## Phase 4 — Complete testnet v3 LP

**Status:** Polygon fork lifecycle is verified; the Base Sepolia LP adapter remains to be implemented and qualified.

- [ ] Pin compatible LP SDK packages; qualify the testnet position manager and owner-bound NFT reads.
- [ ] Display principal/current token amounts, range/in-range status, liquidity and uncollected fees from verified pinned reads/math. Keep unsupported economics unavailable.
- [ ] Implement mint and increase with bounded tick/range/input/minimum/deadline, exact approvals and fresh simulation.
- [ ] Implement partial/full decrease, collection and close/burn. Distinguish owed principal from accrued fees and check burn prerequisites/residual allowance.
- [ ] Add LP-specific rejection, ownership change, pending/replacement/reorg/indexer-lag and original-hash recovery tests.
- [ ] Run the lifecycle on a disposable fork, then obtain owner-operated public-testnet NFT and lifecycle receipt evidence.

**Exit:** Create → increase → partial decrease → full decrease → collect → close is reproducible; ownership, liquidity progression, owed/collected amounts, balances and approvals reconcile. Collection is not represented as guaranteed positive fees when no fees accrued.

**Owner:** Later review/sign capped LP actions on their testnet NFT. No preexisting mainnet NFT is required. **Dependency:** Phase 2 policy/state foundation and Phase 3 receipt/recovery patterns. **Likely paths:** core/API LP adapters and math, position/action UI, browser/fork scripts.

## Phase 5 — Assemble the standalone desktop product

**Status:** Routes, UI foundation and some operational controls exist; end-to-end testnet integration is incomplete.

- [ ] Connect pool discovery/detail, swap and positions/LP into one clearly labeled testnet experience. Keep the Polygon read-only context distinct; do not imply all displayed chains have executable adapters.
- [ ] Match token-launchpad desktop branding and verify normal/loading/empty/error/rejected/pending/confirmed states with useful source/freshness and transaction summaries.
- [ ] Keep token/pool/router/manager, quote/replay, wallet and receipt identity keyed by chain/adapter. Test cross-chain contamination; this prepares scalability but does not qualify a second executable chain.
- [ ] Finish the local-demo access boundary: loopback/same-origin checks, request budgets/rate limits, bounded timeouts, sanitized logs and Base Sepolia dependency readiness. Test single-process restart/lost quote/recovery behavior; shared state is required before replicas.
- [ ] Verify local test/typecheck/lint/build and desktop browser flows. Observe remote CI only through an authorized push/PR; document any unobserved external gate.

**Exit:** A reviewer can navigate the complete desktop testnet flow, understand all states and reproduce local checks. Credentials/signatures/raw upstream payloads stay out of logs and frontend bundles. Local readiness is not production approval.

**Owner:** Desktop visual acceptance and any remote publication authorization. **Dependency:** Phases 3–4 functional adapters; UI/operational subparts can proceed earlier. **Likely paths:** existing routes/components/styles, API guards/readiness/logging, CI and runbook.

## Phase 6 — Acceptance and demo handoff

**Status:** Pending integrated testnet flows.

- [ ] Provide one setup/faucet/command checklist and one acceptance matrix for pool reads, both swaps, LP lifecycle and failure/recovery cases.
- [ ] Record actual host/live/fork/browser/CI evidence, versions, supported input ranges and known limitations. Review material findings and rerun relevant gates after fixes.
- [ ] Confirm owner desktop acceptance and all public-testnet transaction gates. Document remaining mobile polish as the agreed separate pass.
- [ ] Preserve standalone boundaries and hand over reproducible local start/reset instructions. Public hosting/production deployment needs its own approval and operational plan.

**Exit:** The accepted demo performs real Uniswap testnet swap and LP operations with verified receipts and clear failure/recovery states. `/demo` can remain as a wallet-free teaching mode. No mainnet or production claim follows automatically.

**Owner:** Final installed-wallet/desktop acceptance. **Dependency:** Phases 1–5. **Verification:** Full local quality gates plus sanitized owner testnet receipts, browser results and explicit CI status.

## Work that can proceed without the owner

Prepare pinned artifacts, deployment probes, quote/state/preparation logic, controller/recovery, SDK LP math, disposable-fork fixtures, mocked browser tests, desktop UI and local controls. Stop owner-dependent checks at wallet signatures, public-testnet funding/receipts or unavailable host services. Do not mark those gates passed from mocks or send a wallet transaction on the owner's behalf.

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
