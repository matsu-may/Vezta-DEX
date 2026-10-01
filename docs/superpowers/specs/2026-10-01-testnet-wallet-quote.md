# Base Sepolia wallet-bound read-only quotes

## Scope

Continue phase 2 of the standalone demo with fresh quotes for the fixed USDC/WETH v3 3000 pool. No wallet signing, approval submission, swap submission or frontend execution button is introduced by this slice. An unfunded EOA can qualify a quote.

## Contract

- Accept only the existing strict testnet intent: chain 84532, canonical pair in either direction, six previously studied input sizes, 50 bps slippage and a nonreserved EOA address.
- At one pinned block, verify chain, nonempty code, token decimals, factory pool mapping, pool identity/liquidity/price, tick spacing 60, router factory/WETH/position manager and quoter/manager factory/WETH getters.
- Verify block freshness at start and after all reads; use the original block timestamp plus 30 seconds as expiry. Reject blocks over 10 seconds in the future, changed hashes and incomplete work. A study has a 25-second abort deadline and one active request; busy requests fail explicitly.
- Quote through QuoterV2, reject invalid outputs/price movement, TickMath limit exhaustion and impact above 100 bps after fee. Compute minimum with bigint, floor(output × 9950 / 10000).
- Return a strict wallet-bound quote and random 48-character opaque ID. Store at most 128 entries, bind every read/consume to the complete normalized intent, expire at the original deadline and consume synchronously once. Restart loses quotes; clients request fresh ones.
- HTTP POST `/api/v1/testnet/base-sepolia/quote` accepts bounded JSON only, rejects query parameters and extra fields, returns no-store sanitized failures. It does not return transaction calldata or provider credentials. The API remains loopback only.
- Configuration checks are evidence of configured dependencies, **not** bytecode/source verification. Return `runtimeVerified: false` and `executionEnabled: false`; execution remains gated by independent deployment proof, state and simulation.

## Wallet state follow-through

Add a separate read-only wallet state reader and POST `/api/v1/testnet/base-sepolia/state` using the same strict intent. Read EOA code, both token balances, native test ETH, router allowance and mined nonce at one fresh block. Pending nonce must equal the pinned mined nonce before and after the reads; confirm the original block hash. Validate all uint bounds and fail closed on nonce movement or provider errors. Return provenance, balances, input funding, native ETH presence and the one-step exact/reset/ready approval **kind**, without calldata. Native ETH presence is not proof of sufficient gas; runtime verification, gas estimates and simulation remain open. The state reader has its own single-flight/25-second budget. An unfunded EOA returns valid state with funding false, rather than an unavailable-data error.

## Verification

Unit/transport tests cover both directions, binding/replay, stale/future/reorg, wrong contracts/decimals/EOA, impact and quote failures, late completion, timeout/busy recovery, HTTP input and secret-safe errors. Full test/typecheck/lint/build and independent slice review are required. Host probe reads the configured RPC without requiring funds or signing; live results remain pending when the agent cannot reach RPC.

## Sources

[Official Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments) links v3-core v1.0.0, v3-periphery v1.0.0 and swap-router-contracts v1.1.0. Getter interfaces are taken from those sources; installed artifacts and deployed runtime matching remain a separate gate. See the accepted [adapter strategy](../plans/2026-10-01-uniswap-dependency-and-adapter-strategy.md).
