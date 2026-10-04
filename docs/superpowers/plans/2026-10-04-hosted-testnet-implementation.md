# Hosted Testnet Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Owner authorized independent implementation and a concrete deployment handoff.

**Goal:** Prepare the existing desktop demo for Vercel + DigitalOcean without provisioning infrastructure.
**Architecture:** Shared validated hosted settings; one authenticated Node API with persistent context directories; exact-origin web BFFs.
**Tech Stack:** Node 24, pnpm 10.33.2, TypeScript, Next.js, Docker Compose, Caddy.
**Spec:** `docs/superpowers/specs/2026-10-04-hosted-testnet-design.md`.

## Global Constraints

- Preserve local behavior, testnet runtime/amount/receipt validation and owner data.
- Default-off hosted writes; final recheck denied when disabled, receipts remain readable.
- No infrastructure creation, credentials upload or wallet signatures in this session.
- Focused RED→GREEN per task; full suite once at integration checkpoint to avoid repetition.

## Review Focus

- Invalid hosted configuration must not fall back to local admission.
- Matching Origin alone must not authorize mismatched Host/proxy headers.
- Failed admission must never consume context or spend RPC budget.
- Restart must preserve contexts while discarding unsent in-memory quotes.
- Deployment examples must boot with non-root storage and must not print secrets.

### Task 1: Shared hosted configuration

**Files:** `packages/core/src/hosted-config.ts`, test, `index.ts`.
**Interfaces:** produces `readHostedConfig(env): HostedConfig | undefined` and validated public/API origins, token, writes flag.
- [ ] Write config rejection/default-off tests; run `pnpm exec vitest run packages/core/src/hosted-config.test.ts` (RED: module absent).
- [ ] Implement exact HTTPS origin validation and fail-closed mode parsing.
- [ ] Run same tests (GREEN), commit `feat(dex): define hosted testnet configuration`.

### Task 2: API admission and persistent startup

**Files:** `apps/api/src/hosted-api.ts`, test, `api-binding.ts`, execution gate, `main.ts`.
**Interfaces:** consumes Task 1; produces `createHostedAdmission(env, now)`, `contextDirectories(env, localRoot)` and `requirePrivateApiHost(host, env)`.
- [ ] Test auth, global budgets, disabled recheck/allowed receipt, mainnet denial, binding and private directories; run focused Vitest (RED).
- [ ] Implement guard before body/dispatch; integrate health/readiness, storage paths and hosted execution flag.
- [ ] Run focused tests (GREEN), commit `feat(dex): guard hosted API and persist recovery`.

### Task 3: Web hosted boundaries

**Files:** `apps/web/lib/hosted-boundary.ts`, test, testnet proxy/gate modules, API route durations.
**Interfaces:** consumes Task 1/2; produces `testnetBrowserAllowed(request, env)` and `testnetApiTarget(env, allowLocalAlias?)` returning URL and server headers.
- [ ] Test production HTTPS requests, forged origin/headers, token never returned, invalid-mode no local fallback and receipt with writes off; run focused Vitest (RED).
- [ ] Integrate shared boundary across depth, positions, swap, LP; gate production only via complete hosted config.
- [ ] Run web/core/API boundary tests (GREEN), commit `feat(dex): support approved HTTPS testnet origin`.

### Task 4: Deployment package and handoff

**Files:** `deploy/Dockerfile.api`, `deploy/compose.yaml`, `deploy/Caddyfile`, examples, `.dockerignore`, runbook and roadmap.
**Interfaces:** consumes Tasks 1–3 env contract; single non-root container/private mount, no public API port.
- [ ] Package source workspace with pinned tsx/frozen dependencies and no build scripts; document read-only deploy first.
- [ ] Run clean API boot without owner .env, full tests/typecheck/lint/build and audit; Docker/Compose checks if daemon available. Expected: clean checks or explicit tool/environment limitation.
- [ ] Fresh whole-branch review and one fix pass for material findings; commit package, update checkpoint and owner handoff.

## Pre-flight interfaces

| Producer → consumer | Decision |
|---|---|
| Task 1 → 2/3 | Same env names and strict HTTPS/token parsing; never independent permissive fallbacks |
| Task 2 → 3 | BFF sends bearer token, API independently gates final recheck; receipt remains available |
| Tasks 1–3 → 4 | Compose uses same env contract; persistent root owner UID1000; startup checks permissions |

Execution notes and any rulings are recorded in the session report. Owner's instruction
to proceed independently takes precedence over repeated spec/plan approval prompts.
