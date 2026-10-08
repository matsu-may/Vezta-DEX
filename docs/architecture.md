# Vezta DEX Architecture

## Current scope

This independent pnpm workspace integrates existing Uniswap contracts. The primary desktop product supports bounded USDC/WETH swaps and v3 LP positions on Base Sepolia (`84532`) and Unichain Sepolia (`1301`). Historical Polygon (`137`) research and local rehearsal remain separate. No proprietary AMM, mainnet activation, or integration into the main Vezta application is included.

Routes are `/swap`, `/explore/{tokens,pools,transactions,auctions}`, `/pools/{address}`, `/positions`, and `/positions/{create|NFT-ID}`. `/` redirects to `/swap`. Base is default; `?network=unichain-sepolia` selects Unichain. Existing `/networks/{slug}/...` aliases and `/demo/*` remain available. Auctions are unsupported explanatory views.

## Runtime boundaries

```text
User wallet <── explicit connect/review/sign/submit ── apps/web
                                                     │
                                             Next.js API handlers
                                                     │ HTTP
                                                  apps/api
                                                     │
                              RPC / historical Uniswap Trading API
                                                     │
                                            Uniswap contracts

packages/core ── shared chain identity, schemas and transaction policy
```

| Layer | Responsibility |
|---|---|
| `apps/web/app/` | Thin pages and server route handlers; stable public URLs. |
| `apps/web/features/` | Swap, liquidity, explore, wallet, activity, composition, historical flows. |
| `apps/web/components/` | Shared UI, layout/navigation, transaction presentation. |
| `apps/web/lib/` | Shared routing, network selection, gates, hosted boundary, coordination. |
| `apps/api/src/http/` | Endpoint dispatch and per-chain composition. |
| `apps/api/src/modules/` | Discovery, swap, liquidity, wallet reads, action/receipt verification. |
| `apps/api/src/infrastructure/` | RPC transport/pacing, HTTP admission/logging, deployment qualification. |
| `apps/api/src/cli/`, `tooling/` | Explicit studies and fork/evidence/compiler utilities. |
| `packages/core/src/` | Browser-safe registries, schemas and canonical policy checks. |

The API bootstrap stays `apps/api/src/main.ts`. Next handlers proxy/validate requests rather than duplicating domain implementations. Credentials and original-action persistence remain server-side. Existing core root/subpath exports stay stable.

## Transaction lifecycle

Testnet uses direct Uniswap v3 integration. Base compares curated swap pools; Unichain uses its bounded configured pool. LP actions target the qualified 0.3% pool on each chain.

1. Validate wallet-bound intent, chain, token identity, amount, slippage and pool.
2. Qualify dependencies at pinned stable/fresh blocks and enforce quote expiry.
3. Read balances, nonce, allowances and fee budget. Approvals authorize exact reviewed inputs/caps; conflicting residual allowances may require a separate reset.
4. Prepare canonical unsigned calldata, simulate, then recheck before an explicit wallet prompt.
5. Preserve original context/hash across reload or unknown outcomes. Verify receipts/economic effects before acknowledgement and balance/position refresh.

The wallet alone signs/submits. Pending recovery blocks competing swap/LP/network actions. Base supports EOAs and its specifically qualified MetaMask delegation profile; Unichain requires an EOA. Unsupported shapes fail closed. Simulation is not confirmation.

LP supports full/custom range mint, increase, partial/full decrease, collect, and closing an empty NFT. Decrease accrues owed tokens; collect transfers them. Stored owed combines principal and fees. Explorer activity is browser-local, not a global indexer. Provenance/freshness are displayed; raw liquidity is not USD TVL or APR.

## Tooling and qualification

CLI/fork/source/compiler tools are grouped separately. Qualification consumes pinned fixtures/evidence without changing bytecode pins or evidence roots. Local fork funding is not public wallet acceptance; estimated fee budgets differ from verified actual L1/operator charges. Colocated tests run through the standard test/typecheck/lint/build gates.

See [source navigation](maintenance/source-layout.md), [desktop acceptance](runbooks/2026-10-07-uniswap-ui-desktop-acceptance.md), and the [testnet completion plan](superpowers/plans/2026-10-01-standalone-testnet-completion.md). Dated research/reports retain historical checkpoint claims.

## Deployment and future integration

Vercel's root stays `apps/web`. The Node API deploys independently using `deploy/Dockerfile.api`, Compose and Caddy. Public execution needs reachable/authenticated backend configuration, persistent recovery storage, admission/rate controls and approved origin/gates. Hosting only the frontend does not host the backend.

Historical Polygon retains its own Universal Router/Permit2 and hook-free v4 policies; its spenders must not be copied into testnet actions. Later Vezta integration should reuse wallet/auth providers and its backend OpenAPI/frontend generation boundary. This refactor changes source organization only.
