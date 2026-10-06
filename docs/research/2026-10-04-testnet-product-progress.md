# Testnet product completion ledger

Plan: `docs/superpowers/plans/2026-10-04-testnet-product-completion.md`.
Base: `ffed15b`. Branch: `codex/testnet-product-completion`.

## Current state

Owner confirms desktop wallet acceptance (both swaps, complete LP, failure/recovery),
compact UI and Vercel frontend visual acceptance. Backend hosting was deferred.
The default executable adapter remains the qualified Base Sepolia 0.3% pool.
Phase 7 additionally qualifies four curated direct swap pools under the same router. The new
implementation adds bounded custom amounts/slippage, custom mint ranges,
four-fee discovery and local observed activity. The previous acceptance does not
automatically accept these new behaviors on the public chain.

## Decisions

- Work in a sibling worktree; preserve owner's `.gitignore`, `next-env.d.ts`,
  running servers, credentials and contexts in the original checkout.
- Keep existing demo caps and add bounded slippage; selected values flow through
  existing validators, stores, simulation and receipt checks.
- No remote push: the user's Vercel project may deploy automatically from main.
- Keep full-range as the default and leave custom price inputs empty; the user
  chooses a range. Exact BigInt math snaps outward; SDK math builds calldata.
- Keep 0.3% as the default and the only LP execution pool. Four curated swap
  pools have separate full-runtime proofs; explicit comparison or selection binds
  the winner into the original quote and never reroutes recovery. Depth alone
  remains insufficient for execution.
- Local history retains up to 100 observations, scoped to account/chain. Persist
  the returned recovery hash first, then optional history. Quota/privacy failure
  must not clear or consume active recovery. Unverified/reorg observations replace
  earlier success amounts rather than retaining an apparent verified output.
- Complete snapshot fee budgets remain estimates. L2 receipt gas cost is not
  complete charged fees, and relayer gas cost is not automatically a wallet debit.

## Phase status, 2026-10-06

| Phase | Status | Remaining |
|---|---|---|
| 1 | Complete | None |
| 2 | Implemented, local verification passed | One public custom amount/slippage swap |
| 3 | Implemented, local verification passed; custom-range fork mint gas estimation timed out | Small custom-range public mint, read/increase/decrease/collect; custom-range fork receipt evidence remains unqualified |
| 4 | Implemented, local verification passed | Owner browse/filter/detail delta check |
| 5 | Implemented, local verification passed | Owner activity/reload/account isolation check; complete charged fees separately unqualified |
| 6 | Local gates/review passed, handoff prepared | Owner delta acceptance; publication is separate |
| 7 | Implemented; independent runtime, unit, fork and browser checks passed | Owner comparison/selected-pool wallet delta acceptance; public receipt evidence for newly selected pools |
| 8 | Read-only feasibility measured on two candidates; shared read client and adapter boundary prepared | Owner chain choice, independent runtime/fee/finality qualification and adapter |

## Verification

- Baseline: 139 Vitest files, 1,025 passed/one skipped; 85 Node script tests passed.
- Full implementation checkpoint: 143 Vitest files, **1,071 passed/one skipped**;
  **85 Node script tests passed**. One bounded-worker run, not repeated per feature.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` passed. ESLint reports only the
  existing React-version autodetection warning; no rule violations.
- Mock browser checks on an isolated production server: **37 swap**, **54 LP**,
  **29 discovery/navigation** checks passed. No live RPC, signature or public
  broadcast in these browser checks. Cold development-page/SSR hydration checks
  first failed; switched to the production build to remove dev-stream/HMR noise.
- Browser runner fixes: use JSON cloning in CLI sandbox; evaluate URL parsing
  in the browser, where `URL` exists. Screenshots visually inspected for desktop.
- Independent reviewer ran 109 focused tests, checked late-response invalidation,
  range/cap/calldata/recovery boundaries and identified the history/quota ordering
  problem. Both swap/LP regression tests first failed and then passed after fixing
  ordering; no remaining important findings reported.
- BigInt TickMath matches SDK 3.31.5 across all usable spacing-60 ticks, signed
  bit multipliers and boundaries. Real custom-range public/fork receipt evidence
  is still pending; fixture/browser results are not that evidence.
- One read-only public receipt probe for the existing owner-supplied swap hash
  found `l1Fee`/Jovian DA fields, but no complete operator-charge evidence. Keep
  `actualTotalFeeQualified:false`; no final total is inferred from an upper bound.

## Phase 7 checkpoint

- Four independently rebuilt pool runtimes matched full on-chain bytes. Public
  hashes, compiler/input/output provenance, historical samples and limits are in
  [routing evidence](2026-10-05-direct-pool-routing-evidence.md).
- Same-block direct comparison, explicit pool selection, quote/store/calldata/
  receipt binding and compatible legacy recovery are implemented. LP remains 0.3%.
- Live read-only quotes selected different winners by direction. A guarded
  **0.05% local fork** passed reset/exact approvals, both swaps, context/receipt
  tracking and residual allowances; snapshot reverted and owned Anvil stopped.
- Fresh review caught the nested MetaMask decoder's fee-3000 assumption. RED/GREEN
  tests cover all newly curated fees in both directions and reject substituted
  signed calldata. No other important findings were reported.
- Final full checkpoint: **149 Vitest files, 1090 passed/one skipped; 85 Node
  tests passed**. Typecheck/lint and final production build passed.
- Final production build passed. Legacy desktop swap mock: **37 checks passed**.
  Production desktop routing mock: **14 checks passed**, including selected pool
  URL, visible coverage/winner, review, exact submitted calldata, reload recovery
  and invalid URL rejection. All browser API/wallet calls were mocked. The initial
  fixture inconsistently set action execution true and study false; corrected
  the mock, then awaited acknowledgment storage clearing before navigation.
  No production safety check was relaxed for browser fixtures.
- Historical owner acceptance is retained. New public MetaMask receipts and
  custom-range acceptance remain owner checks. No owner checkout merge or remote
  publication was performed.

## Second-chain choice

Read-only feasibility was measured for **Ethereum Sepolia (11155111)** and
**Unichain Sepolia (1301)**. Both 0.3% USDC/WETH pools served all six sampled demo
sizes within 1% price impact. Neither candidate has independently rebuilt runtime
or execution qualification in this project yet. Recommend Unichain for OP Stack
adapter reuse; Ethereum broadens coverage to L1 with a different fee adapter.
Owner choice is pending; no second chain was activated. Measurements, primary
sources and next steps: [feasibility report](2026-10-05-second-testnet-feasibility.md).

## Final independent checks, 2026-10-06

See the [current evidence and limits](2026-10-06-independent-checks-progress.md).
The LP fork harness now carries opt-in custom ticks through approval rounds and
checks NFT/restart range identity. Two bounded live attempts passed exact
approvals but timed out at mint gas estimation; neither produced a custom-range
mint receipt. This does not change the historical full-range acceptance.

A bounded read-only receipt-fee CLI validates chain/transaction/canonical block
identity and leaves missing components unknown. The historical swap probe has
L2/L1 fields but no operator fee; complete charged fees remain unqualified.
Base now consumes the shared read transport. Fresh review caught and regression
tests fixed both exposed-request and mutable-queued-input allowlist bypasses.
Phase 8 activation still awaits owner choice; the existing Base product remains
the target of one consolidated owner acceptance pass.

## Trust-boundary extensions

- Decimal rounding/overprecision: reject before quote; selected bps determines
  integer minimum and exact inner calldata. Editing invalidates pending responses.
- Inverse CLMM price/range: use USDC per WETH, preserve token order, snap outward
  and bind ticks in mint inspection. Zero caps grant no authority for that token.
- Pool selection/query tampering: match both fee and address; reject duplicates,
  partial/malformed selections and expired reads. Hidden selections expose no writes.
- Browser history poisoning/storage quota: strict bounded schema, fixed explorer
  links, account filtering, unknown cost labels and recovery-first persistence.
- New-chain assumptions: chainId is part of identity but is not a complete adapter;
  fee model, runtimes, wallet envelopes and recovery still require separate proofs.
