# Vezta DEX Architecture

## Design intent

The standalone project follows the useful separation in `vezta-tokenlaunchpad`: a browser frontend and a server API with an explicit boundary. It stays smaller because the first release consumes Uniswap contracts and does not deploy contracts or run a custom matching engine. Polygon is the sole executable chain in the first release; every token, pool, quote, transaction and position still carries `chainId` so later chains do not change identity rules.

```text
apps/web (Next.js, wallet UI) ──HTTP──> apps/api (validated DEX endpoints)
       │                                      │
       │ user signs and submits               ├──> Uniswap Trading/LP APIs
       └──────────────────────────────────────└──> Polygon RPC / pool data source
                                      │
                               Uniswap contracts
```

## Proposed layout

| Path | Responsibility |
|---|---|
| `apps/web/` | `/swap`, `/explore`, `/pools`, pool detail and positions; Polygon wallet connection; transaction preview, signing and receipt UI. |
| `apps/api/` | Narrow HTTP endpoints for token/pool data, quotes and unsigned transaction preparation; input validation, Uniswap API keys, caching and rate limits. It never stores a private key or sends a user transaction. |
| `packages/core/` | Chain-aware IDs and request/response schemas shared by web and API. Keep protocol-specific quote and LP adapters behind small interfaces. |
| `docs/` | Roadmap, architecture, milestone specs, evidence and later implementation plans. |

Next.js matches `vezta-fe`; a small TypeScript HTTP API can follow the Hono pattern already used by the independent token launchpad. The exact dependency versions belong to the scaffold implementation plan, not to this architecture note. A database and custom indexer are deferred until pool data needs cannot be met reliably by a chosen source.

## Data and signing boundaries

1. The server validates `chainId`, token addresses, integer amounts and supported route type before asking Uniswap for a quote or LP transaction. API credentials remain server-side. [Trading API integration](https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide), [LP API integration](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/integration-guide).
2. The browser checks that the wallet is on Polygon and that the returned `to`, spender, recipient, amount limits and expiry match the user's visible intent before requesting approval or a signature. A fresh quote is required after account, chain, tokens, amount or slippage changes.
3. The wallet alone signs and submits. An API response or successful simulation is not a confirmed transaction; the UI waits for a receipt, then refreshes balances and positions.
4. Pool lists and historical metrics may be indexed and delayed. Display their source and freshness. Read current chain/protocol state for transaction preparation. Pool identity includes `chainId`, Uniswap version, token pair, fee parameters and v4 hook address when applicable.
5. For the initial AMM swap path, limit quoted protocols to Uniswap `V2`/`V3`/`V4` and accept only `CLASSIC`. Pin Universal Router `2.1.2` for Polygon on quote and swap calls where supported. The exact ERC20 approval targets canonical Permit2 and is planned from a pinned on-chain allowance read. UniswapX orders and cross-chain plans have different execution states and belong to later specs. [Supported chains and router versions](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

## Testnet demo adapter

Base Sepolia (`84532`) is a separate demo candidate. Its hosted Trading API probe repeatedly timed out upstream, so the [RPC demo design](superpowers/specs/2026-10-01-base-sepolia-rpc-demo.md) chooses direct Uniswap v3 contract integration for that candidate. Factory/token/pool identity and six bidirectional QuoterV2 calls share one pinned block, followed by a block-hash recheck. `pnpm testnet:depth` exposes the terminal study; `/testnet` reads the same study via Next `/api/testnet-depth` → API `/api/v1/testnet/base-sepolia/depth`. The API deduplicates concurrent checks and aborts after 45 seconds; core validates sample identities, integer impact, qualification flags and block provenance at both response boundaries. Completed studies are not cached. Web previews expire after 120 seconds and a refresh clears previous results.

Only server-side `BASE_SEPOLIA_RPC_URL` is needed; the response carries no API key, permit or transaction payload. The page performs no automatic discovery or wallet access and never selects a pool automatically. A qualifying depth result does not enable wallet writes or qualify testnet execution. See the [discovery plan](superpowers/plans/2026-10-01-testnet-discovery-page.md) and [host verification runbook](research/2026-10-01-base-sepolia-testnet-preflight.md).

The private API also provides read-only POST `/api/v1/testnet/base-sepolia/{quote,state}` using a strict wallet-bound intent. The selected fee-3000 quote verifies dependencies and impact at one stable block, expires at the original block time plus 30 seconds, and is stored under an opaque once-consumable ID (128-entry single-process store). State reads EOA code, both tokens/native ETH, router allowance and stable mined/pending nonce. Each study has a 25-second deadline and single active request; source transport preserves its eight-second request timeout. Unfunded state is valid, with funding false. Configuration checks do not prove deployed bytecode, sufficient gas or simulation; execution stays disabled. There is no web execution proxy/controller yet. See [wallet read progress](research/2026-10-01-testnet-wallet-read-progress.md).

All Base Sepolia source factories share process-local pacing by RPC origin: default three request starts per second and at most two active HTTP requests. Optional `BASE_SEPOLIA_RPC_RPS` accepts integers 1–6; it is independent of hosted Uniswap API quotas. The bounded queue cancels on study abort or after 25 seconds; HTTP's eight-second timeout starts only on dispatch. Existing study/quote deadlines and all identity reads remain unchanged, with no retry, cache or alternate RPC. Independent processes still share the provider's quota externally; concurrent CLI/server studies or a stricter provider can still fail closed.

The owner confirmed qualified live depth and matching bidirectional previews. The bounded demo candidate is the v3 0.3% pool. Core now provides a [pure calldata policy](superpowers/specs/2026-10-01-testnet-swap-calldata.md): one ERC20 `exactInputSingle` wrapped in an original 30-second deadline multicall to Base Sepolia SwapRouter02. Approval is exact and targets that router directly; any nonzero differing allowance requires a reset receipt and new read. This uses neither Polygon Universal Router nor Permit2. Canonical calldata comparison rejects changed recipients, amounts, deadlines, extra calls and trailing bytes. No API/web execution consumer uses it yet; live deployment/quote/state qualification, simulation, explicit wallet submission, receipt and LP gates remain open. The 120-second discovery preview is not an executable 30-second quote.

## Threats to address before writes

The owner selected `V4_NO_HOOKS` for V4 routing on 2026-09-28. V2/V3 remain eligible. The API inspects every route branch/hop and rejects missing or nonzero V4 hook metadata before quote storage. This metadata guard does not replace future pool-provenance, calldata and simulation checks.

| Scenario | Asset / impact | Control and verification | Owner |
|---|---|---|---|
| Lookalike token or wrong chain | User signs for the wrong asset | Curated `chainId + address` registry; on-chain decimals; display addresses; wrong-chain and duplicate-symbol tests | API + web |
| Changed transaction target or recipient | Token approval or swap can move funds elsewhere | Validate allowed target/spender and intent-bound recipient/limits before wallet prompt; test tampered responses | API + web |
| Stale quote or Permit2 signature | Unexpected execution or failed trade | Invalidate on input changes, enforce expiry, refresh before sign; test delayed approval and price moves | Web |
| Excess token allowance | Persistent permission beyond this swap | Exact `approve(Permit2, amountIn)` only from zero allowance; block pre-existing different allowance; recheck before wallet prompt | API + web |
| Stale pool or position index | Misleading liquidity, fee or balance display | Timestamp data, label estimates, refresh from chain after receipt; test index lag | API + web |
| Public API key proxy abuse | Quota exhaustion and unavailable quotes | Keep key server-side; explicit endpoints, validation and rate limits; test malformed/high-volume requests | API |

The table is an initial threat model. Local servers bind to `127.0.0.1`; any public deployment needs an upstream rate limit for the Trading API proxy before exposing its API key quota. Each write milestone revisits the exact pool, router and wallet implementation; this is not a security certification.

## Later integration with Vezta

Keep product logic behind API and adapter interfaces so it can move to `vezta-be` without importing the standalone server into `vezta-fe`. When the DEX moves to the main site, reuse its auth and wallet providers and follow the backend OpenAPI → frontend Kubb generation flow. The standalone frontend is a development and release boundary, not a second permanent Vezta login.
