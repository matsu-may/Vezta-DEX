# Vezta DEX

Standalone development project for Vezta's Uniswap spot trading and liquidity experience. The first chain is Polygon. Native USDC/WETH v3 pools are the read-only starting set; no pool is approved for live trading yet.

Start with [the roadmap](docs/roadmap.md), [architecture](docs/architecture.md), [Polygon pool research](docs/research/2026-09-27-polygon-weth-usdc.md), and [the first-slice spec](docs/specs/2026-09-27-foundation-and-pool-discovery.md). The current app implements that first read-only slice: `apps/api` reads the Uniswap v3 factory and pool contracts through Polygon RPC; `apps/web` renders `/explore`, `/pools`, and `/pools/[poolId]`; `packages/core` holds chain-aware IDs and the curated token registry.

## Local setup

Requires Node.js 24 and pnpm 10.33.2. From this directory:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The API listens on `127.0.0.1:3021`, and the web app on `127.0.0.1:3020`; these avoid Vezta's existing `3000`/`3001` and launchpad's `3010`. `POLYGON_RPC_URL` can point to another trusted Polygon RPC; use HTTPS except for local development. `DEX_API_URL` is server-only and must be reachable by the Next.js process. The public RPC in the example can be rate-limited; unavailable reads show a visible error state. Neither app needs a wallet or API key for this read-only slice.

```bash
pnpm test       # Vitest: identity, API errors, pool reader, display states
pnpm typecheck  # TypeScript across all packages
pnpm lint       # ESLint/Next rules
pnpm build      # Production Next.js build
```

Pool discovery is intentionally limited to the native-USDC/WETH pair and four v3 fee tiers. The on-chain `liquidity()` value is shown as raw protocol data, never as TVL. Volume, APR, position earnings, swap and LP actions remain unavailable until their live-data and transaction checks pass. An authenticated Uniswap API key will be held by the API when those later slices are built; never put it in `NEXT_PUBLIC_*` variables.

The DEX is developed independently first. Integration into `vezta.io/swap`, `/explore`, and `/pools` is a later milestone, after the standalone product passes its own checks.
