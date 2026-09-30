# Vezta DEX

Standalone development project for Vezta's Uniswap spot trading and liquidity experience. The first chain is Polygon. Native USDC/WETH v3 pools are the read-only starting set; no pool is approved for live trading yet.

Start with [the roadmap](docs/roadmap.md), [six-phase standalone plan](docs/superpowers/plans/2026-09-30-standalone-dex-next-phases.md), [architecture](docs/architecture.md), [Polygon pool research](docs/research/2026-09-27-polygon-weth-usdc.md), and [Trading API swap spec](docs/specs/2026-09-27-trading-api-swap.md). The current app implements read-only pool discovery, an indicative v3 single-pool comparison, and a wallet-bound Trading API quote preview. `apps/api` reads Polygon RPC and calls Uniswap Trading API; `apps/web` renders `/explore`, `/pools`, pool detail and `/swap`; `packages/core` holds chain-aware IDs, the curated token registry and quote validation.

## Local setup

Requires Node.js 24 and pnpm 10.33.2. From this directory:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The API listens on `127.0.0.1:3021`, and the web app on `127.0.0.1:3020`; these avoid Vezta's existing `3000`/`3001` and launchpad's `3010`. `POLYGON_RPC_URL` can point to another trusted Polygon RPC; use HTTPS except for local development. `DEX_API_URL` is server-only and must be reachable by the Next.js process. Set `UNISWAP_API_KEY` in `apps/api/.env` to enable wallet-bound Trading API quotes; never put it in `NEXT_PUBLIC_*` or share it in logs. Without a key, pool discovery and the indicative QuoterV2 comparison still work, while the routed quote returns a controlled unavailable state.

The original public RPC timed out on two of five latest-block reads. A replacement passed 15/15 direct chain/block calls; three restarted-API runs had 12/12 wallet-state and 11/12 quote success, with one eight-second Trading API timeout and one 13.1-second state tail. Follow-up direct quotes passed in both directions and the final two local runs were 8/8 for both endpoints. This is read-only preflight evidence; pinned/receipt and funded wallet checks remain open. See [RPC/quote evidence](docs/research/2026-09-30-intermittent-rehearsal-reads.md). The independent read-only LP access probe is `node scripts/smoke-lp-pool-info.mjs`; it checks one curated v3 pool without signing and uses `UNISWAP_LP_API_KEY` if set, otherwise `UNISWAP_API_KEY`. A matching pool-info response does not authorize LP writes; see [LP feasibility](docs/research/2026-09-30-lp-api-feasibility.md).

```bash
pnpm test       # Vitest and read-only diagnostic/script tests
pnpm typecheck  # TypeScript across all packages
pnpm lint       # ESLint/Next rules
pnpm build      # Production Next.js build
```

Pool discovery is intentionally limited to the native-USDC/WETH pair and four v3 fee tiers. The on-chain `liquidity()` value is shown as raw protocol data, never as TVL. `/swap` now distinguishes the single-pool comparison from the Trading API's best-price Uniswap AMM route across v2/v3/v4; neither quote enables wallet execution yet. Volume, APR, position earnings and LP actions remain unavailable until their live-data and transaction checks pass.

The routed Trading API preview returns a validated summary and an opaque `quoteId`. Its full upstream response stays in a bounded, 30-second, single-process server store. `POST /api/v1/swap-preparation` now consumes it once, verifies the saved PermitSingle signature or exact existing permission, validates router effects, rechecks account/nonce/allowance/balances and simulates at explicit Polygon blocks. It returns an unsigned transaction and provenance; no server signing/broadcast occurs. The public `/swap` displays only the summary and cannot submit a swap. The separately approved local rehearsal can request owner-signed actions; see below. See [rebuild/preparation evidence and remaining wallet gates](docs/research/2026-09-28-eoa-signer-validation.md).

Receipt helpers in `apps/web/lib/transaction-receipt.ts` and `receipt-tracking.ts` validate a submitted transaction against Polygon receipt/block data and preserve its original hash/account through timeout or changed intent. They request balance refresh only for a successful receipt at an explicit confirmation threshold. The opt-in local controller now wires receipt observation, original-account economic verification and balances after confirmed success or revert. Production confirmation/replacement policy and funded checks remain open. See [receipt validation](docs/research/2026-09-29-receipt-tracking-validation.md).

Preparation accepts only the curated intent, `quoteId` and optional signature; never supply replacement quotes, permit messages or transactions. Executable calldata contains the accepted Permit2 signature, so do not log full requests/responses or paste real signatures into chat. Failed preparation never restores the consumed ID; obtain and review a new quote/message. Accepted owner/message digests prevent reuse across quote IDs until signature expiry. Quotes and replay records are bounded in memory; public replicas require shared state and abuse controls.

After restarting the local API with the current code, run `node scripts/smoke-local-quote.mjs` to check both directions through the quote store. It prints only identity checks and whether an opaque ID was returned; it does not print the upstream quote or use a wallet key.

`POST /api/v1/approval-plan` reads the selected token's Polygon allowance to Permit2 and returns an unsigned exact-amount plan. Zero allowance produces `approve(Permit2, amountIn)`; an already exact allowance produces `ready`; any other nonzero allowance produces `blocked-existing`. It never signs or submits. Public wallet-write controls remain disabled; the local rehearsal is an explicit development exception.

For a read-only live check, start the API with `pnpm --filter @vezta-dex/api start` in one terminal, then run `node scripts/smoke-approval-plan.mjs` in another. The script uses a public dummy wallet by default and prints only allowance categories and decoded transaction identity, never raw calldata. A working Polygon RPC is required.

The Trading API client spaces requests at 5 RPS inside this one API process, leaving room under the supplied 6 RPS key limit. More than one process needs a shared limiter before public use. To check the key and quote shape without sending a transaction, run `node scripts/smoke-trading-api.mjs`; to inspect proposed ERC20 approvals without signing or submitting, run `node scripts/smoke-approval.mjs`. Both read the ignored API `.env`, print sanitized summaries and require network access. See the [evidence record](docs/research/2026-09-27-trading-api-live-evidence.md).

The DEX is developed independently first. Integration into `vezta.io/swap`, `/explore`, and `/pools` is a later milestone, after the standalone product passes its own checks.

Routing explicitly includes V2/V3 and **V4 without hooks** (`V4_NO_HOOKS`). The API rejects unverifiable route metadata before keeping the quote; no inclusive-hook fallback is used. `node scripts/smoke-trading-api.mjs` collects `routePolicyMatches` and sanitized `permitDiagnostics` timing fields. Approved policy: exact amount, maximum remaining 30-day Permit2 allowance and 30-minute signature deadline, independently constrained by the 30-second quote lifetime. See [evidence and decision](docs/research/2026-09-28-hook-free-routing-and-permit-policy.md).

## Opt-in local wallet rehearsal

The owner-approved six-step implementation adds `/rehearsal` only under the loopback development launcher. Stop the normal web server on3020 first; keep the API running in another terminal.

```bash
pnpm --filter @vezta-dex/api start  # terminal1
pnpm dev:rehearsal                 # terminal2; http://127.0.0.1:3020/rehearsal
```

This page requests real wallet actions only after explicit clicks, capped at 1 native USDC → WETH on Polygon137. Use only `http://127.0.0.1:3020` with a Web Locks-capable browser and one test profile; localhost browser alias is rejected. It uses exact ERC20 allowance, validated unchanged Permit2 messages, fresh simulation/gas, retained uncertain/submitted identity, origin-wide coordination, nonce/inclusion proof and read-only reload recovery. Pending account activity blocks; manual hashes are candidates until verified. Normal development and production do not enable it. Do not copy launcher flags into a public server or `.env.local`. `DEX_API_URL` must use fixed loopback port3021.

Read the [owner checklist](docs/research/2026-09-29-local-wallet-owner-checklist.md) before opening a wallet prompt. It includes a mock-only browser command, rejection/identity checks, owner-only approval/swap steps and sanitized evidence fields. The owner completed read-only installed MetaMask checks and the browser mock run (nine checks and 41 intercepted API calls); real signing, broadcast and funded execution remain unconfirmed. The agent environment still cannot reach the owner's local listener. See [verification](docs/research/2026-09-29-local-wallet-validation.md) and [decisions](docs/research/2026-09-29-local-wallet-decisions.md). Public trading, reverse funded execution, LP and main Vezta integration stay gated.
