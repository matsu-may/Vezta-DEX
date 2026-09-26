# Repository Guidelines

## Project Structure

This is a standalone DEX project, separate from `vezta-fe` and `vezta-be`. `packages/core/src/` owns Polygon token and pool identities; `apps/api/src/` reads Uniswap v3 contracts and serves validated JSON; `apps/web/app/` renders `/explore`, `/pools`, and pool detail. Tests sit beside the code as `*.test.ts` or `*.test.tsx`. Research and implementation plans live in `docs/`.

## Development Commands

Use Node 24 and pnpm 10.33.2. `pnpm install` installs the workspace; `pnpm dev` runs the API on port 3021 and Next.js on port 3020. Set `POLYGON_RPC_URL` in `apps/api/.env` and `DEX_API_URL` in `apps/web/.env.local` using the examples. `pnpm test` runs Vitest, `pnpm typecheck` checks all packages, `pnpm lint` runs ESLint, and `pnpm build` builds the web app.

## Code and Data Rules

Use strict TypeScript and two-space indentation. Name files in kebab case and React components in PascalCase. Token identity is `chainId + address`; pool identity is `chainId + protocol + reference`. Keep native USDC distinct from bridged USDC.e. Read contract addresses from the curated registry and official deployment references. Never turn v3 `liquidity()` into USD TVL, fees, or APR. Include `source`, `observedAt`, and block number with pool data. The server holds RPC/API credentials; the browser never signs through the server.

## Testing and Change Review

Write a failing test before behavior changes, then run the full suite, typecheck, lint, and build. Test malformed IDs, wrong chain, token order, missing pools, provider failure, stale data, and transaction payload validation when writes are added. Browser checks are required for responsive changes. A passing unit suite does not establish a safe live swap or LP action: complete the gates in `docs/roadmap.md` first.

## Commits and Pull Requests

Keep commits scoped by feature or layer; use messages such as `feat(dex): add Polygon pool reader` or `docs(dex): record pool evidence`. PRs should link the relevant spec, summarize user-facing behavior, list actual verification commands, and include screenshots for page changes. Never commit `.env` files or credentials.
