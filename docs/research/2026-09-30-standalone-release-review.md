# Standalone DEX Release Review — 2026-09-30

**Status:** Code and configuration inventory, not a production approval. No deployment or main Vezta integration was performed.

## What is already bounded

The public `/swap` page is read-only. The development wallet rehearsal is enabled only with the explicit launcher flag and loopback host, and its same-origin proxy validates action, JSON size, intent and response shape. The API defaults to `127.0.0.1:3021`; API keys stay in the API environment. The local workflow has test, typecheck, lint and build jobs. The single-process Trading API scheduler is paced at 200 ms between dispatches, below the owner's stated 6 RPS key limit, with a bounded queue. These controls are useful locally but are not a multi-instance release policy.

## Open release gates

| Gate | Current evidence | Required result before public wallet writes |
|---|---|---|
| Polygon data availability | Original RPC timed out on 2/5 latest-block calls; replacement passed 15/15 direct reads and 4/4 wallet-state reads, with one 13.1-second state tail | Complete pinned/receipt qualification and measure tail latency without weakening freshness checks |
| Trading API availability | One `TRADING_API_TIMEOUT` in the first four local quotes; both direct directions and the next eight local quotes succeeded | Continue monitoring tail latency and classify repeated failures; preserve quote TTL and fail-closed behavior |
| Wallet execution | Mock browser lifecycle passed; no funded signature, broadcast or economic receipt | Owner-operated capped forward and separate reverse checks, tampered/expired/rejected paths, canonical economic receipt evidence |
| Shared state | `QuoteStore`, consumed permits and Trading API limiter are process-local | Define one shared quota, quote/replay state and atomic consumption across replicas, or explicitly deploy one constrained instance and test restart/loss behavior before any scale-out |
| API exposure and abuse | Local rehearsal proxy is narrow; direct API preparation endpoints have no user-level access control | Keep private endpoints unreachable from the public internet until authentication, per-client quotas, request budgets and abuse tests are in place |
| Health and observability | `/health` returns process liveness; no structured RPC latency, API status or transaction-state metrics | Add separate readiness and sanitized telemetry for RPC latest/pinned reads, upstream 429/5xx, quote expiry, simulation failure and receipt delay; never log keys, signatures or raw payloads |
| LP correctness | Authenticated LP API returned one matching v3 pool; owner host independently verified factory, pool and state at fresh pinned Polygon block `94721672` | Qualify each unsigned action shape; validate calldata, owner position and post-transaction economics before LP write UI |
| CI and deployment | CI workflow exists; local test/typecheck/lint/build passed, but remote CI was not observed and no deployment configuration was exercised | Observe CI on a pushed branch; review secrets, host binding, rollback and rate budgets before a standalone deployment |

The 30-second quote lifetime and two-confirmation local receipt observation are **not** a production finality or replacement policy. A successful `/health` response must not be interpreted as Polygon/Uniswap readiness. Pool liquidity alone must not be displayed as TVL or earnings. Keep public swap writes and LP writes disabled until their separate gates pass.

## Current acceptance boundary

Accept the current work as a standalone **read-only product plus an opt-in local test harness**. The code has not earned a funded-wallet or production-release claim. The LP pool identity read gate passed, while unsigned LP actions remain open. The remaining external evidence includes pinned/receipt RPC qualification and owner-operated wallet execution.
