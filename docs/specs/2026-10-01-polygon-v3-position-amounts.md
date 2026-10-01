# Polygon v3 Position Amounts — Verification Design

**Scope:** Fixed Polygon native-USDC/WETH 0.05% pool, read-only position display. Keep `currentAmounts` and `uncollectedFees` as `null` until this design is implemented and independently checked. No wallet action is part of this work.

## Source and calculation

Uniswap's [PositionValue.principal](https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/PositionValue.sol) derives current principal from the position's liquidity, lower/upper ticks and the pool's current `sqrtPriceX96`; [LiquidityAmounts.getAmountsForLiquidity](https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/LiquidityAmounts.sol) handles below-range (token0 only), in-range (both) and above-range (token1 only). The maintained [v3 SDK](https://github.com/Uniswap/sdks/blob/main/sdks/v3-sdk/package.json) exposes `Pool` and `Position` with `amount0`/`amount1` in raw units. Its published source is MIT licensed. Use a pinned version of the SDK rather than inventing tick rounding in application code.

Read `slot0.sqrtPriceX96`, `slot0.tick`, pool liquidity, NFT owner and `positions(tokenId)` at the **same pinned block**. Bind them to the fixed pool's chain, address, ordered token0/token1, fee and tick spacing. Confirm the block hash after all reads. Reject a zero/invalid sqrt price, invalid tick, stale or reorganized block, changed owner, wrong pair or wrong fee. Pass the raw integers into the SDK; return decimal strings of raw USDC and WETH units with an explicit `principalEstimate` label. Never add `tokensOwed` to principal.

## Evidence before display

Add deterministic tests for below/in/above range, zero liquidity, reversed token order, 6-versus-18 decimals, SDK validation failure and reorg. On a disposable Polygon fork, compare the backend result for a minted NFT against the official SDK at the identical block, then compare a full decrease receipt's token deltas within contract rounding. Only then change the frontend response schema and desktop table. A live Polygon NFT is useful for a later real-world read check, but is not required to write these tests.

`tokensOwed0/1` alone are **not total uncollected fees**: fee growth since the position's last update and amounts owed from principal decreases must be separated. The [PositionValue.fees](https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/PositionValue.sol) path needs additional pool/tick fee-growth state. Keep `uncollectedFees: null` until that accounting and receipt reconciliation are verified; never call owed principal “earned fees.”

## Current blocker

The SDK packages are absent locally. A pinned install attempt on 2026-10-01 failed with `ENOTFOUND registry.npmjs.org` before modifying the lockfile. Retry when npm DNS is available; do not substitute floating-point formulas or publish guessed balances.
