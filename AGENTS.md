# Repository Guidelines

## Project Structure

This standalone pnpm workspace is independent of `vezta-fe` and `vezta-be`. Read `docs/architecture.md` and `docs/maintenance/source-layout.md` first. `apps/web` is the Next.js frontend; `apps/api` is the Node API; `packages/core` contains shared policies, schemas, and chain identities.

Routes stay in `apps/web/app`; product code lives in `features/{swap,liquidity,explore,wallet,activity,workspace}`. Shared components live in `components/`; historical flows live in `features/legacy`. Backend runtime code lives in `http/`, `modules/`, and `infrastructure/`; studies use `cli/` and `tooling/`. Tests remain beside their code. Scripts are grouped by purpose.

## Development Commands

Use Node 24 and pnpm 10.33.2. `pnpm dev` runs web/API on 3020/3021; `pnpm dev:testnet` explicitly enables local wallet flows. Configure server credentials in `apps/api/.env` and the API origin in `apps/web/.env.local` using the examples. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` are the quality gates. Existing `pnpm testnet:*` command names remain stable.

## Coding and Transaction Rules

Use strict TypeScript, two-space indentation, kebab-case files, and PascalCase components. Keep core browser-safe; secrets, RPC transport, and persistence belong on the server. Tokens use `chainId + address`; pools include chain/protocol identity. Preserve provenance, freshness, exact approvals, simulation, and original-hash recovery. The user's wallet signs/submits; the server never signs or broadcasts user transactions. Never derive USD TVL/APR from raw `liquidity()`.

## Testing Guidelines

Use Vitest (`*.test.ts[x]`) and Node's test runner (`scripts/**/*.test.mjs`). Add regression tests before behavior changes. For file moves, preserve assertions and verify imports, fixtures, env loading, workers, and subprocess setup. Run full gates once after targeted checks. Browser checks are required for UI changes; structural refactors do not require funded transactions or repeated public RPC probes.

## Commits and Deployment

Use scoped messages such as `refactor(dex): organize source modules`. PRs link the plan and list verification; UI changes include screenshots. Never commit credentials or private recovery/evidence. Vercel's root stays `apps/web`; the API entrypoint stays `apps/api/src/main.ts`. Mainnet activation and Vezta integration remain separate work.
