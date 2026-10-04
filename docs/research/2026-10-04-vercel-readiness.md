# Vercel readiness after desktop demo acceptance

**Status, 2026-10-04:** local UI implementation/build qualified. No Vercel project
was created, connected or deployed in this session. This is the next deployment
plan, not a claim that the current local demo already works on a public domain.

The actionable [six-phase hosted testnet plan](../superpowers/plans/2026-10-04-hosted-testnet-vercel.md)
records dependencies, packaging/recovery gates, Vercel settings and owner
decisions. The local and GitHub default branch are now `main`; the earlier local
`main` is preserved as `archive/main-before-2026-10-04`.

## Recommended deployment shape

Host `apps/web` on Vercel and keep `apps/api` as one separately hosted Node
service with persistent private storage. For the first capped testnet release,
one API process preserves the existing quote/context and RPC pacing model.
Do not introduce replicas until quote consumption, contexts and provider budgets
use shared atomic state. Wallets continue to sign/send every transaction.

This minimizes protocol changes while retaining restart recovery. Moving the
whole API into serverless functions would require a shared store and a larger
concurrency/recovery migration. Vercel's function filesystem is read-only apart
from scratch `/tmp`; it is unsuitable for the current durable context files.
[Vercel runtime documentation](https://vercel.com/docs/functions/runtimes).

## Current code blockers

| Area | Existing behavior | Required preparation |
|---|---|---|
| Read BFFs | `testnet-depth.ts` /`testnet-lp.ts` allow only local HTTP API origin | Explicit server-configured HTTPS upstream allowlist, bounded redirects/timeouts and existing response validation. |
| Wallet BFFs | Swap/LP proxies require `127.0.0.1:3020`, HTTP origin and loopback forwarded headers | Exact approved public origin; correct trusted proxy handling; no wildcard origin policy. |
| Submission permission | `testnet-demo-gate.ts` requires development +loopback opt-in | Separate default-disabled hosted-testnet permission policy, retaining runtime/chain/freshness/recheck gates. Environment flags alone cannot enable the current production build. |
| Backend | `main.ts` runs a local Node HTTP listener and initializes private context stores | Configurable deployment binding, HTTPS gateway, authenticated BFF-to-API calls and persistent private volume. |
| Concurrency | Quote stores and limiters are process-scoped | Single API process first; enforce public request budgets at the shared backend, not only inside separate Vercel function instances. |
| Recovery | Swap/LP contexts live under `.local-evidence` | Preserve them across restart/deploy; never put private contexts in `public/`, Git or `/tmp`. Browser recovery is also origin-bound. |

Do not copy local `.env` files or private evidence into Vercel. Ship only the
verified runtime pins/artifacts required by the API; runtime verification must
remain mandatory. Review packaging before deploying the API.

## Next implementation sequence

1. Specify the hosted frontend/API origins, proxy trust, API authentication,
   request budget, storage and deployment/rollback boundaries.
2. Implement a hosted configuration alongside existing loopback mode. Test wrong
   origins, forged forwarded headers, unauthorized API calls and production
   default-disabled writes. Local behavior and wallet controls remain intact.
3. Package the API with pinned dependencies/evidence, durable context storage and
   readiness checks. Qualify restart, expiry, once-only recheck and receipt
   recovery; retain one instance for this first release.
4. Build the web app with production environment and test its HTTPS proxy against
   a staging API. Confirm RPC/API keys never appear in browser output.
5. After approval of that concrete staging setup, publish Vercel and run one small
   testnet swap plus an LP acceptance sample on the hosted origin. Existing local
   acceptance does not qualify a different proxy/origin/storage environment.

A UI-only preview can be published earlier, but it must clearly show unavailable
reads and disabled trading; it is not the functional online DEX demo.

## Web project settings to prepare

| Setting | Proposed value |
|---|---|
| Repository | Standalone `vezta-dex`, not the container workspace or main Vezta |
| Framework /root | Next.js /`apps/web` |
| Shared workspace | Include files outside root so `packages/core` is available |
| Install | `pnpm install --frozen-lockfile`, workspace lockfile and pinned package manager |
| Build | `pnpm exec next build --webpack`, matching the verified production build |
| Output | Next.js default `.next`; keep framework detection |
| Node | 24.x, matching local verification |
| Environments | Separate preview/production API settings and default-disabled submission |

Vercel supports pnpm workspaces and selecting the app root; shared packages must
be included in the build scope. [Monorepo guide](https://vercel.com/docs/monorepos),
[shared-source settings](https://vercel.com/docs/monorepos/monorepo-faq).
Node 24.x is currently supported. [Supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Configure secret API credentials through server environment settings after the
hosted implementation exists. Domain choice/API hosting/provider costs are the
owner's next deployment decisions. Mainnet execution and Vezta integration remain
outside this deployment plan.
