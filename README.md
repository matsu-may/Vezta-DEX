# Vezta DEX

Standalone development project for Vezta's Uniswap spot trading and liquidity experience. The first chain is Polygon. Native USDC/WETH v3 pools are the read-only starting set; no pool is approved for live trading yet.

Start with [the roadmap](docs/roadmap.md), [architecture](docs/architecture.md), [Polygon pool research](docs/research/2026-09-27-polygon-weth-usdc.md), and [the first-slice spec](docs/specs/2026-09-27-foundation-and-pool-discovery.md). The current app implements read-only pool discovery and a single-pool swap preview: `apps/api` reads the Uniswap v3 factory, pools and QuoterV2 through Polygon RPC; `apps/web` renders `/explore`, `/pools`, pool detail and `/swap`; `packages/core` holds chain-aware IDs, the curated token registry and quote arithmetic.

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

Pool discovery is intentionally limited to the native-USDC/WETH pair and four v3 fee tiers. The on-chain `liquidity()` value is shown as raw protocol data, never as TVL. `/swap` previews exact-input quotes for the researched 0.05% pool; it does **not** search other routes or allow wallet execution yet. Volume, APR, position earnings and LP actions remain unavailable until their live-data and transaction checks pass. If a hosted Uniswap API is added later, its key belongs on the API server, never in `NEXT_PUBLIC_*` variables.

The DEX is developed independently first. Integration into `vezta.io/swap`, `/explore`, and `/pools` is a later milestone, after the standalone product passes its own checks.
