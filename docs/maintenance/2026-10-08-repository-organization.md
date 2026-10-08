# Repository Organization Handoff — 2026-10-08

## Delivered

The approved structural refactor is applied in the original `vezta-dex` checkout on local branch `codex/repository-organization`. No additional worktree, external repository, dependency installation, public transaction, or deployment was created.

- Kept the outer pnpm workspace: `apps/web`, `apps/api`, `packages/core`.
- Relocated 446 source/test/script/fixture files into their feature/module groups; adjacent tests moved with their owners.
- Kept Next routes in `app/`; grouped shared components into UI/layout/transaction presentation and historical flows into `features/legacy`.
- Grouped backend HTTP dispatch, domain modules, infrastructure, CLI entrypoints, and fork/evidence/compiler/probe tooling.
- Grouped core domains and extracted Polygon registry definitions into `chains/polygon.ts`; root/subpath export names remain unchanged.
- Updated package commands, test aliases, relative imports, fixture/env/evidence URLs, compiler worker paths, and isolated subprocess test setup.
- Updated contributor guidance, architecture, README, current deployment/runbook command references, and the source navigation guide.

See [source navigation](source-layout.md) and the complete [old/new path map](2026-10-08-path-migrations.json). Historical reports/specs retain their dated paths and checkpoint claims; use the map when following an old direct-file command.

## Preserved

Public routes, HTTP endpoints, chain/router/token policies, allowance amounts, quote expiry, simulation, wallet prompts, receipt verification and recovery semantics are unchanged. Ports, package names, dependency versions, lockfile, API bootstrap, Docker entrypoint, and Vercel root remain unchanged.

The owner's existing `.gitignore`, generated `next-env.d.ts`, untracked Uniswap screenshots, env files, and private evidence/recovery data were preserved. A production build rewrote generated `next-env.d.ts`; its original owner bytes were restored afterward. These owner changes are excluded from the refactor's staging.

## Verification

| Check | Result |
|---|---|
| Baseline TypeScript | Passed before relocation. |
| Filesystem/subprocess tests | 33 passed across five relevant suites. |
| Decimal/input regression checks | 32 passed across five suites after correcting a codemod defect. |
| Final `pnpm test` | 180 Vitest files; 1,165 passed, one existing skip; 85 Node tests passed. |
| `pnpm typecheck` | All three workspace packages passed. |
| `pnpm lint` | Passed; existing React autodetection advisory remains. |
| `pnpm build` | Production Next.js build passed, including existing product/legacy routes. |
| Source/protected-file audit | Remaining source edits are paths except the documented fixture setup and unchanged registry extraction; 2,185 pre-existing protected files retained their hashes. |
| Independent review | Import targets, exports, commands, env/fixture/compiler paths, subprocess topology and 24,602 non-import literal tokens reviewed; no outstanding Critical/Important finding. |

The first full suite caught an overbroad codemod changing the decimal separator `"."` in three parsers. Those changes were reverted to the original expressions, verified by targeted regression tests and an independent literal audit, then the full gate was rerun successfully. No transaction/test assertions were weakened.

No UI behavior/layout was changed, so funded wallet acceptance, live RPC probes, compiler rebuilds and browser screenshot suites were not repeated. Build and existing component/controller tests cover relocation; this does not expand public-chain qualification.

## Owner checks and publication

No repeat of the full funded swap/LP lifecycle is required for this refactor. Optional smoke check: run `pnpm dev:testnet` and open `/swap`, `/explore`, `/positions`; confirm the existing pages and header render. Existing pnpm command names work without reinstalling dependencies.

Direct `node scripts/...` and raw `src/...-cli.ts` commands must use their new grouped paths. GitHub push and Vercel deployment are not part of this session.
