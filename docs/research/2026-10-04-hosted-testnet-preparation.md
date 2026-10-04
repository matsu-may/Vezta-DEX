# Hosted testnet preparation checkpoint

**Date:** 2026-10-04. **Scope:** standalone Base Sepolia desktop demo; web on
Vercel, one Node API on DigitalOcean. No live infrastructure provisioned or
wallet transaction submitted in this session. Owner's running local servers,
credentials, contexts and dirty `next-env.d.ts` were preserved.

## Implemented

- Shared fail-closed hosted configuration: exact HTTPS origins, server bearer
  secret, production mode and explicit default-off writes.
- API Base Sepolia allowlist, constant-time token check, 2 active requests,
  normal 60/min and receipt 120/min budgets. Polygon routes remain unavailable
  in hosted mode. Final rechecks are denied before consumption when writes are off.
- HTTPS BFFs for discovery, positions, swap and LP; exact browser Host/Origin,
  consistent forwarded headers, server-only upstream token and existing response
  validators. Local loopback policy retained. Routes declare 60-second duration.
- Configurable private context root with swap/LP stores, liveness `/healthz`
  and authenticated configuration/storage `/readyz`. One process only.
- Non-root API Dockerfile, read-only filesystem/private data mount, Compose,
  Caddy HTTPS, environment template and [owner runbook](../deployment/vercel-digitalocean.md).
- LP interrupted-write recovery: only bounded, private regular temporary files
  with exact names are removed on restart; committed JSON/hash preserved. LP
  rename now synchronizes its directory, matching the swap store.

## Decisions made independently

1. Use a **Droplet + Caddy** with one persistent API process. No shared-state
   migration or additional replicas for this demo.
2. Deploy read-only first; both API and web opt in to writes. Kill switch keeps
   receipt tracking available. Pending recovery data is never cleared by rollback.
3. Make pinned `tsx` a runtime dependency and install only production dependencies
   with scripts disabled in the image; TypeScript source exports remain supported.
4. Upgrade Next.js / eslint-config-next **16.1.6 → 16.3.8**, Vitest **4.0.18 →
   4.1.11** within their major versions. Pin `viem>ws` to **8.22.0**. Preserve
   viem/Uniswap protocol and artifact versions.
5. SDK dependencies indirectly included Hardhat watchers even in a production
   install. Remove unused `hardhat-watcher` dependencies specifically from
   `swap-router-contracts` and `v3-periphery` via pnpm overrides. ABI artifacts
   remain; the artifact compatibility CLI still passes. Rebuild scripts use
   separate pinned compiler tools, not package watchers.
6. Use available Docker tag **Caddy 2.11.6**: 2.11.7 existed as a GitHub release
   but its Docker tag was unavailable during preparation.

## Verification actually performed

| Check | Result |
|---|---|
| Full `pnpm test`, final sequential run | 139 Vitest files; 1,025 passed, 1 intentional skip; 85 Node script tests passed |
| `pnpm typecheck` / `pnpm lint` | Passed; lint retains React detection warning at workspace root |
| Production `next build --webpack` | Passed on Next 16.3.8 |
| Actual Next production listener, synthetic hosted env | Approved forwarded HTTPS reaches schema validation; wrong origin denied; writes-off recheck denied; receipt still reaches validation; secret absent from HTML/responses |
| Real Node HTTP listener test | Health/auth/allowlist/recheck/recovery schema checks passed without owner env or RPC |
| Linux temporary-path regression | Reproduced under `TMPDIR=/tmp`, fixed test isolation; focused checks pass |
| LP crash regression | RED reproduced lost availability; GREEN recovery and 4 unsafe-file cases pass; related LP/swap store tests 45/45 |
| Docker image build / Caddy validation / Compose config | Passed; Compose config checked with `--quiet` and synthetic settings |
| Read-only API container | UID1000; health200, unauth ready401, configured-RPC-missing ready503, writes-off recheck403 |
| Persistent Docker volume fixture | LP original hash restored after container restart using deterministic clock; no owner contexts/RPC used; owned container/volume removed |
| Artifact ABI/calldata CLI | Passed after dependency changes; not a live runtime requalification |

A full run while Docker/build ran concurrently hit six CLI subprocess timeouts.
The affected 18-test file passed alone, then the entire final suite passed alone
in about 82 seconds. No test timeout/criterion was weakened. Heavy verification
is sequenced on this shared host to avoid repeating resource-contention failures.

## Dependency audit and remaining limits

Original workspace audit: **3 critical, 29 high, 29 moderate, 11 low**. Final:
**0 critical, 1 high, 0 moderate, 2 low** across the workspace; production-only
audit: **0 critical/high/moderate, 2 low**.

- Remaining high: `braces` in dev ESLint glob tooling, no published patched
  version reported. Lint processes trusted repository files; it is excluded from
  the API production image. Do not treat this as a zero-advisory workspace.
- Low: ethers' transitive `elliptic` and tsx's `esbuild`. SDK position math and
  trusted source compilation are used; this API does not use ethers to sign
  untrusted data or run esbuild's development server. Track upstream patches and
  review before expanding runtime use or mainnet scope.

Audit reduces known dependency exposure; it does not prove wallet security.
Sources: [Next security advisories](https://github.com/vercel/next.js/security/advisories),
[Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp),
[pnpm dependency removal overrides](https://pnpm.io/10.x/settings#overrides).

## Owner handoff — required next

1. Create/select Vercel project and DigitalOcean Droplet, SSH key and API hostname.
2. Follow the runbook to deploy read-only, keep data UID1000/mode700 and set matching
   production origin/token privately. Enable no preview writes.
3. Qualify actual HTTPS reads with your RPC; `/readyz` alone does not do this.
4. Enable both writes flags only after qualification. Check small bidirectional
   swaps, LP lifecycle, Reject/reload and original-hash recovery through API restart.
5. Record release/URL/hashes, accept desktop UI on hosting and film demo.

Preparation covers code/config for hosting phases 1–4. Phases 5–6 (real staging,
DNS/TLS, backups, hosted wallet acceptance and publication) remain open. Actual
complete L1/operator fees, mainnet, mobile polish, broader chain execution and
integration into Vezta remain their existing separate gates.
