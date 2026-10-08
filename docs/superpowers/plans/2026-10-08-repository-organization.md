# Repository Organization Implementation Plan

**Goal:** Make the existing standalone DEX easier to navigate and maintain without changing its behavior.

**Architecture:** Keep the pnpm workspace, `apps/web`, `apps/api`, and `packages/core`. Move files and their adjacent tests into feature/module folders, updating imports and filesystem paths together. Preserve routes, package exports, transaction policies, storage locations, and deployment roots.

**Execution:** Implement directly in the existing checkout on a dedicated local branch. The user approved the proposed organization and requested implementation; additional approval of routine file moves is unnecessary.

## Constraints

- Preserve the owner's `.gitignore`, generated `next-env.d.ts`, screenshots, environment files, and private evidence/recovery data.
- Keep web/API ports 3020/3021, package names, dependency versions, and the pnpm lockfile.
- Keep `apps/api/src/main.ts`, Next.js `app/`, Docker entrypoint, and Vercel root `apps/web`.
- No public-chain transactions, deployment, push, contract changes, or new runtime dependencies.
- Preserve test assertions; change test setup only when filesystem relocation requires it.

## Tasks

### 1. Inventory and mechanical relocation

- [x] Record tracked paths, source bytes, and protected owner-file hashes before changes.
- [x] Generate an explicit old/new path manifest and apply syntax-aware import edits.
- [x] Backend: `http/`, `modules/{swap,liquidity,wallet,transaction,discovery}/`, `infrastructure/{rpc,http,deployments}/`, `cli/`, and `tooling/{fork,evidence,compiler,probes}/`.
- [x] Frontend: `features/{swap,liquidity,explore,wallet,activity,workspace,legacy}/`; shared `components/{ui,layout,transaction}/`; keep shared routing/gating in `lib/`.
- [x] Core: `chains/`, `swap/`, `liquidity/`, `transaction/`, `configuration/`; retain public root/subpath exports.
- [x] Scripts: `dev/`, `browser/`, `diagnostics/`, `smoke/`, `fork/`, `evidence/`; retain public pnpm commands.

### 2. Filesystem and tooling compatibility

- [x] Rebase `import.meta.url` paths for env files, fixtures, compiler workers, package resolution, and local evidence to their original physical targets.
- [x] Update package scripts, Vitest aliases, and source-evidence subprocess fixture setup.
- [x] Verify the relative import graph and protected files; run targeted filesystem/subprocess tests.

### 3. Current contributor documentation

- [x] Update `AGENTS.md`, architecture, README, and a source navigation guide.
- [x] Publish the old/new path manifest and point historical instructions to it; preserve historical evidence reports.
- [x] Document where new features, CLI tools, tests, and shared policies belong.

### 4. Final verification and review

- [x] Run full existing tests once, typecheck, lint, and production build.
- [x] Check no change to non-path code, constants, assertions, exports, lockfile, or protected owner files.
- [x] Review runtime/tooling boundaries and subprocess/env/fixture resolution independently.
- [x] Report changes, verification, and any owner checks; leave deployment and push for the owner to request.

## Review Focus

- Moving a CLI must still load `apps/api/.env` and the original `.local-evidence` directory.
- Compiler workers must preserve their working directory and resolve tsx/solc independently of the shell cwd.
- Copied source-evidence test projects must retain the same import topology as the real project.
- Browser scripts, fixtures, and package subpath imports must survive relocation.
- Root product URLs, pending transaction recovery, and deployment entrypoints must remain unchanged.

## Progress

Inventory started at commit `10be959`; baseline owner changes recorded separately from this refactor.

Completed in the original checkout on `codex/repository-organization`. The final full suite passed (1,165 Vitest + 85 Node tests; one existing skip), as did typecheck/lint/build and independent review. No UI layout change required a browser rerun. Public push/deployment was excluded. See [handoff](../../maintenance/2026-10-08-repository-organization.md).
