# Source Layout and Contributor Navigation

The outer layout stays `apps/web` (frontend), `apps/api` (backend), and `packages/core` (shared code). Both apps deploy independently. Keep one pnpm lockfile and the existing package names.

## Where to make a change

| Work | Location |
|---|---|
| Swap quote/approval/review/recovery | `apps/web/features/swap/{components,lib}/` |
| Position lifecycle and range UI | `apps/web/features/liquidity/{components,lib}/` |
| Token/pool discovery and details | `apps/web/features/explore/{components,lib}/` |
| Header wallet session/provider | `apps/web/features/wallet/components/` |
| Browser-local activity | `apps/web/features/activity/{components,lib}/` |
| Page composition / virtual demo | `apps/web/features/workspace/` |
| Shared UI, layout, transaction presentation | `apps/web/components/{ui,layout,transaction}/` |
| Shared routing, network and coordination | `apps/web/lib/` |
| Historical Polygon / rehearsal | `apps/web/features/legacy/{polygon,rehearsal}/` |
| Backend dispatch | `apps/api/src/http/` |
| Backend domain logic | `apps/api/src/modules/{swap,liquidity,wallet,transaction,discovery}/` |
| RPC and pacing | `apps/api/src/infrastructure/rpc/` |
| Admission, binding, logging, readiness | `apps/api/src/infrastructure/http/` |
| Deployment qualification | `apps/api/src/infrastructure/deployments/` |
| Terminal entrypoints | `apps/api/src/cli/` |
| Fork/compiler/evidence/probes | `apps/api/src/tooling/{fork,compiler,evidence,probes}/` |
| Shared registries and policies | `packages/core/src/{chains,swap,liquidity,transaction,discovery,configuration}/` |

Tests and `*.test-helper.ts` stay with their modules. Frontend fixtures live with swap/liquidity; backend binary fixtures stay in `apps/api/src/fixtures/`. Test helpers are not runtime exports. `packages/core/src/index.ts` remains the public barrel; existing exported `@vezta-dex/core/*` names stay stable.

## Dependency boundaries

- Web/API consume browser-safe policies from core; secrets, transport and persistence stay server-side.
- Runtime web code never imports backend modules; cross-layer fixture imports are test-only.
- Routes compose features and proxy to the API rather than duplicating backend implementations.
- Never import a `cli/` entrypoint from runtime code: importing one may execute a study.
- Deployment evidence does not replace live intent, simulation or receipt checks.
- Preserve exact approvals, network identity, execution gates and original-context recovery.

## Scripts and stable commands

Existing `pnpm dev`, `dev:testnet`, `dev:rehearsal`, and `testnet:*` names remain stable. Direct script paths moved:

```bash
node scripts/diagnostics/diagnose-testnet-discovery.mjs
node scripts/smoke/smoke-local-quote.mjs
playwright-cli -s=dex-mock run-code --filename=scripts/browser/smoke-rehearsal-browser.js
pnpm --filter @vezta-dex/api exec node --import tsx src/cli/diagnose-wallet-state-cli.ts
```

Use `scripts/dev/` for launchers, `browser/` for Playwright snippets, `diagnostics/` for read diagnostics, `smoke/` for probes, `fork/` for explicit local fork operations, and `evidence/` for provenance/rebuild tools. Probe gates remain in effect; a folder name does not authorize a transaction.

The complete [old/new path map](2026-10-08-path-migrations.json) translates dated instructions. Historical reports/specs may refer to old paths; resolve them through this map instead of recreating duplicate files.

## Stable operational paths

- Vercel root: `apps/web`; API bootstrap: `apps/api/src/main.ts`.
- Credentials: `apps/api/.env`, `apps/web/.env.local`.
- Private evidence/compiler/context data: original `.local-evidence` and `.superpowers` locations.
- Public routes, workspace names, ports, dependencies and lockfile are unchanged.

For structural refactors, run affected fixture/subprocess checks, then full tests/typecheck/lint/build once. Funded wallet transactions and repeated historical live probes are unnecessary for pure file moves.
