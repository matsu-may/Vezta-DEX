# Polygon DEX Foundation and Pool Discovery — Design Spec

## Purpose

Create the first runnable, **read-only** slice of `vezta-dex`: an independent web app and API that can identify Polygon tokens and display Uniswap pools without asking for a wallet signature. This slice establishes the data and API boundaries needed by later swap and LP work. It does not claim a pool is safe or ready for live trading.

## Scope and behavior

- The project has `apps/web`, `apps/api` and `packages/core` as described in [architecture](../architecture.md). Both applications run locally with documented environment variables; secret values never appear in browser bundles or examples.
- `/explore` lists curated Polygon tokens and discoverable Uniswap pools; `/pools` lists supported pools; `/pools/[poolId]` shows one pool's chain, protocol version, token addresses, fee configuration, liquidity and data timestamp. Route names may use a reversible URL encoding for a v4 `bytes32` pool ID.
- WETH and native USDC on Polygon are **research candidates**. The implementation must read an approved registry created in milestone 0; it must not infer token identity from symbol or treat bridged USDC as the native token.
- The API exposes only the data needed by these pages through validated, chain-aware responses. A provider outage, unknown pool, absent metric or stale index result produces an explicit empty/error state; the UI never substitutes invented TVL, volume, fees or APR.
- No approval, quote-signing, swap, LP write, private key, deployed contract, database or custom indexer is included in this slice.

## Data contracts and boundaries

Define shared schemas for `TokenId = { chainId, address }` and `PoolId = { chainId, protocol, reference }` with protocol-specific fee and hook fields. API outputs include a `source` and `observedAt` for metrics. Treat all addresses and raw amounts as strings; use integer-safe conversion from on-chain decimals. Rank or filter only on metrics actually returned by the selected source; document how missing values sort.

Before implementing the real provider adapter, record the data source, supported Polygon protocol versions, authentication/rate limits and freshness behavior in a short pool-selection note. Uniswap's LP API provides pool state by reference or pair; broad discovery may need an indexed source. [Pool state API](https://developers.uniswap.org/docs/api-reference/pool_info), [v3 subgraph queries](https://developers.uniswap.org/docs/ecosystem/subgraphs/concepts/v3/queries), [v4 subgraph queries](https://developers.uniswap.org/docs/ecosystem/subgraphs/concepts/v4/queries).

## Acceptance checks

1. A clean local setup starts web and API independently; web can load all three routes with the API available and shows a useful error when it is unavailable.
2. Tests distinguish identical token symbols on different chains or addresses, different v3/v4 pool identities, reversed token ordering, missing metrics and stale timestamps.
3. Tests verify that invalid chain/address/pool inputs are rejected at the API boundary and that no secret environment variable is exposed to the browser.
4. Browser checks cover normal, loading, empty and provider-error states at desktop and mobile widths.
5. `lint`, `typecheck`, unit tests and production builds pass in the standalone project. The test runner and CI commands are established with this slice.

## Follow-on work

After this spec is reviewed, write a Superpowers implementation plan for **this slice only**. Swap and LP each receive their own focused spec and plan when milestone 0 has identified the first pool and supported API paths. The [roadmap](../roadmap.md) owns the overall order and exit criteria.
