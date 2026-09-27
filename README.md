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

The Trading API client spaces requests at 5 RPS inside this one API process, leaving room under the supplied 6 RPS key limit. More than one process needs a shared limiter before public use. To check the key and quote shape without sending a transaction, run `node scripts/smoke-trading-api.mjs`; to inspect proposed ERC20 approvals without signing or submitting, run `node scripts/smoke-approval.mjs`. Both read the ignored API `.env`, print sanitized summaries and require network access. See the [evidence record](docs/research/2026-09-27-trading-api-live-evidence.md).

The DEX is developed independently first. Integration into `vezta.io/swap`, `/explore`, and `/pools` is a later milestone, after the standalone product passes its own checks.
