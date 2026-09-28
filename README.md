# Vezta DEX

Standalone development project for Vezta's Uniswap spot trading and liquidity experience. The first chain is Polygon. Native USDC/WETH v3 pools are the read-only starting set; no pool is approved for live trading yet.

Start with [the roadmap](docs/roadmap.md), [architecture](docs/architecture.md), [Polygon pool research](docs/research/2026-09-27-polygon-weth-usdc.md), and [Trading API swap spec](docs/specs/2026-09-27-trading-api-swap.md). The current app implements read-only pool discovery, an indicative v3 single-pool comparison, and a wallet-bound Trading API quote preview. `apps/api` reads Polygon RPC and calls Uniswap Trading API; `apps/web` renders `/explore`, `/pools`, pool detail and `/swap`; `packages/core` holds chain-aware IDs, the curated token registry and quote validation.

## Local setup

Requires Node.js 24 and pnpm 10.33.2. From this directory:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The API listens on `127.0.0.1:3021`, and the web app on `127.0.0.1:3020`; these avoid Vezta's existing `3000`/`3001` and launchpad's `3010`. `POLYGON_RPC_URL` can point to another trusted Polygon RPC; use HTTPS except for local development. `DEX_API_URL` is server-only and must be reachable by the Next.js process. Set `UNISWAP_API_KEY` in `apps/api/.env` to enable wallet-bound Trading API quotes; never put it in `NEXT_PUBLIC_*` or share it in logs. Without a key, pool discovery and the indicative QuoterV2 comparison still work, while the routed quote returns a controlled unavailable state.

```bash
pnpm test       # Vitest and approval-calldata summary tests
pnpm typecheck  # TypeScript across all packages
pnpm lint       # ESLint/Next rules
pnpm build      # Production Next.js build
```

Pool discovery is intentionally limited to the native-USDC/WETH pair and four v3 fee tiers. The on-chain `liquidity()` value is shown as raw protocol data, never as TVL. `/swap` now distinguishes the single-pool comparison from the Trading API's best-price Uniswap AMM route across v2/v3/v4; neither quote enables wallet execution yet. Volume, APR, position earnings and LP actions remain unavailable until their live-data and transaction checks pass.

The routed Trading API preview returns a validated summary and an opaque `quoteId`. Its full upstream response stays in a bounded, 30-second, single-process server store and can be consumed once by a future swap preparation flow. The browser currently displays only the summary; it cannot submit a swap.

After restarting the local API with the current code, run `node scripts/smoke-local-quote.mjs` to check both directions through the quote store. It prints only identity checks and whether an opaque ID was returned; it does not print the upstream quote or use a wallet key.

`POST /api/v1/approval-plan` reads the selected token's Polygon allowance to Permit2 and returns an unsigned exact-amount plan. Zero allowance produces `approve(Permit2, amountIn)`; an already exact allowance produces `ready`; any other nonzero allowance produces `blocked-existing`. It never signs or submits. The web app still has no wallet-write control.

For a read-only live check, start the API with `pnpm --filter @vezta-dex/api start` in one terminal, then run `node scripts/smoke-approval-plan.mjs` in another. The script uses a public dummy wallet by default and prints only allowance categories and decoded transaction identity, never raw calldata. A working Polygon RPC is required.

The Trading API client spaces requests at 5 RPS inside this one API process, leaving room under the supplied 6 RPS key limit. More than one process needs a shared limiter before public use. To check the key and quote shape without sending a transaction, run `node scripts/smoke-trading-api.mjs`; to inspect proposed ERC20 approvals without signing or submitting, run `node scripts/smoke-approval.mjs`. Both read the ignored API `.env`, print sanitized summaries and require network access. See the [evidence record](docs/research/2026-09-27-trading-api-live-evidence.md).

The DEX is developed independently first. Integration into `vezta.io/swap`, `/explore`, and `/pools` is a later milestone, after the standalone product passes its own checks.

Routing now explicitly includes V2/V3 and **V4 without hooks** (`V4_NO_HOOKS`). The API rejects unverifiable route metadata before keeping the quote; no inclusive-hook fallback is used. Rerun `node scripts/smoke-trading-api.mjs` to collect the new `routePolicyMatches` check and sanitized `permitDiagnostics` timing fields. The latter distinguish Permit2 allowance expiration from signature deadline; the duration policy is still pending. See [current evidence and decision](docs/research/2026-09-28-hook-free-routing-and-permit-policy.md).
