# Testnet product completion ledger

Plan: `docs/superpowers/plans/2026-10-04-testnet-product-completion.md`.
Base: `ffed15b`. Branch: `codex/testnet-product-completion`.

## Current state

Owner confirms desktop wallet acceptance (both swaps, complete LP, failure/recovery),
compact UI and Vercel frontend visual acceptance. Backend hosting was deferred.
The executable adapter remains the qualified Base Sepolia 0.3% pool. The new
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
- Retain one qualified execution pool. Alternative pool depth is discovery
  evidence, not runtime evidence or permission to execute.
- Local history retains up to 100 observations, scoped to account/chain. Persist
  the returned recovery hash first, then optional history. Quota/privacy failure
  must not clear or consume active recovery. Unverified/reorg observations replace
  earlier success amounts rather than retaining an apparent verified output.
- Complete snapshot fee budgets remain estimates. L2 receipt gas cost is not
  complete charged fees, and relayer gas cost is not automatically a wallet debit.

## Phase status, 2026-10-05

| Phase | Status | Remaining |
|---|---|---|
| 1 | Complete | None |
| 2 | Implemented, local verification passed | One public custom amount/slippage swap |
| 3 | Implemented, local verification passed | Small custom-range public mint, read/increase/decrease/collect |
| 4 | Implemented, local verification passed | Owner browse/filter/detail delta check |
| 5 | Implemented, local verification passed | Owner activity/reload/account isolation check; complete charged fees separately unqualified |
| 6 | Local gates/review passed, handoff prepared | Owner delta acceptance; publication is separate |
| 7 | Dependency analysis prepared | Separate alternative pool proofs and bound routing execution |
| 8 | Candidate research prepared | Owner choice, real deployment/liquidity/funding qualification and adapter |

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

## Remaining routing boundary

Use the existing SwapRouter02 for direct-pool comparison. Reuse verified pool
compiler/source/settings only after matching fingerprints. For each new address,
bind self-address/factory/tokens/fee/tick spacing/derived maxLiquidityPerTick,
compare the entire patched runtime with pinned-block code and factory mapping,
and save separate evidence. Then bind pool/fee through intent, quote store,
minimum math, recheck, calldata, delegation, receipt and legacy recovery. The
current fixed 3000 fee factor must not be reused for other tiers. Run targeted
fork/browser checks and obtain a public receipt per newly selectable pool.
Swap qualification does not automatically qualify LP at that fee/spacing.

## Second-chain choice

Unichain Sepolia is a candidate for initial read-only feasibility because official
Uniswap docs list v3 contracts, WETH and test-token faucet paths. This is an
engineering inference, not measured pool qualification. Ethereum Sepolia is an
alternative with a different L1 fee/finality model. Contract availability and a
faucet do not prove usable USDC/WETH depth. Resolve deployment-address discrepancies
against the unified deployment feed and on-chain state before pinning a registry.
No second-chain execution or migration was activated.

Sources: [Uniswap Unichain v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-unichain-deployments),
[faucets](https://developers.uniswap.org/docs/unichain/tools/faucets),
[unified deployments](https://developers.uniswap.org/deployments),
[OP Stack Jovian receipt/operator rules](https://specs.optimism.io/protocol/jovian/exec-engine.html).

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
