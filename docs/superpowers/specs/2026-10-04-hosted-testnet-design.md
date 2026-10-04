# Hosted Base Sepolia demo design

Owner authorized independent preparation through the deployment handoff on
2026-10-04. Target: Vercel web + one DigitalOcean Node API; no Vezta integration,
mainnet execution, UI redesign or new wallet signing model.

## Configuration and boundaries

Shared validated settings: `DEX_HOSTED_MODE=1`, `NODE_ENV=production`,
`DEX_PUBLIC_ORIGIN` and `DEX_API_URL` are exact HTTPS origins (no credentials,
paths, query, fragments, wildcard or local/IP hostnames). `DEX_BFF_TOKEN` is
64 hexadecimal characters, supplied privately to both servers. Missing/invalid
hosted config fails closed. `DEX_HOSTED_WRITES_ENABLED=1` is explicit opt-in;
unset/0 disables executable actions. Local loopback behavior remains unchanged.

Web POSTs require JSON and browser Origin + request Host matching the configured
frontend. Forwarded Host/Proto, when present, must agree; reject Forwarded.
In hosted mode the client's forwarded IP is not an authorization source; it is
not expected to be loopback. Exact Host/Origin validation remains mandatory.
Next.js deployment is the trusted web runtime; API ignores client proxy identity
and authenticates BFF calls with the server token, compared in constant time.
Server-configured upstream only, no redirects, bounded JSON/timeouts, no-store.

Hosted API permits only Base Sepolia endpoints, never historical Polygon
preparation endpoints. Consumer permissions require both web and API opt-in.
When disabled, final rechecks are denied before consuming/issuing action contexts;
quote, study and original receipt recovery remain available. API has no signer.

The shared API guard bounds authenticated request starts globally: normal
60/minute and receipt 120/minute, independently; at most two active requests.
It does not trust client IPs or create unbounded per-IP maps. These are demo
budgets, not protection against all distributed abuse; requests fail 429 rather
than queue. Existing RPC limiter and request schemas remain in effect.

## Binding, storage and health

Loopback binding remains default. `0.0.0.0` is accepted only with validated hosted
config. Docker exposes API only inside its network to Caddy. Hosted startup
requires `DEX_CONTEXT_DIR`, an absolute private directory, outside temporary
paths; separate `swap`/`lp` subdirectories use existing validated stores. No local
owner contexts are uploaded. One process owns storage; no replicas.

Unauthenticated `/healthz` exposes liveness only; authenticated `/readyz` reflects
configured RPC and successfully initialized context stores, not full chain/RPC
qualification. Do not label this probe as a simulation or deployed runtime check.
Preserve atomic writes, restart recovery, existing 24-hour context expiry and
opaque capability IDs. HTTPS protects IDs in transit; possession of a context ID
remains the existing tracking capability, not a new authenticated user session.

## Packaging and delivery

Keep pinned tsx as a runtime dependency and install production dependencies with
scripts disabled in the API image: the source workspace exports TypeScript. This
excludes legacy contract rebuild/Hardhat tooling from the running image. Use Node 24 and
pnpm 10.33.2, frozen lockfile. Runtime pins are compiled application source;
source rebuild tools/private evidence are never runtime requirements.
Non-root API, read-only image with writable private bind mount and scratch tmpfs.
Caddy handles HTTPS; no API host port. Existing CSS/UI/wallet validators unchanged.

Provide Dockerfile, Compose, Caddyfile, environment examples and a step-by-step
DigitalOcean/Vercel runbook. Never run commands that print expanded secrets;
never enable writes in preview by default. Vercel routes use an explicit 60-second
function duration to cover the existing 50-second discovery fetch, subject to
the account's deployment limits. Stable HTTPS frontend origin precedes writes.

## Threat model

| Scenario | Asset / assumption | Impact | Mitigation / verification | Owner |
|---|---|---|---|---|
| Wrong frontend or forged headers | Wallet reviews; Vercel request headers reflect incoming host | Unapproved origin requests | Exact origin/host/proto tests, no wildcard | Web |
| Direct API / leaked token | RPC quota, contexts; server credentials stay private | Abuse / tracking exposure | Constant-time auth, no client token, bounded global admission tests | API / operator |
| Mainnet endpoint exposed | Real funds | Wrong chain preparation | Hosted Base-only route allowlist before dispatch | API |
| Lost volume / unsafe path | Original context/hash | Failed recovery | Private persistent directory, restart/store tests, backup runbook | API / operator |
| Disabled writes still consuming recheck | Pending actions | Unexpected executable context | Deny final recheck before dispatch, receipt remains readable | Both |
| Distributed BFF requests | RPC budget | 429/timeouts | Single-process limiter and bounded active count; no replicas | API |
| Secret in image/log/Git | RPC/auth credential | Unauthorized calls | Explicit image inputs, ignored env, redacted scans, safe logs | Operator |

## Acceptance

Hosted auth/origin/config negative tests, HTTPS proxy behavior, consumer flags,
kill-switch receipt availability, private storage restart and clean API boot
must pass locally. Full tests/typecheck/lint/build run at the group checkpoint.
Docker validation runs only if the daemon is available; missing daemon is reported.
Real DNS/TLS, Vercel deployment and wallet receipt acceptance remain owner handoff.
