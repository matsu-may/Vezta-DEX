# Polygon Uniswap Trading API Swap — Design Spec

## Intent and boundary

Let a user preview and eventually sign an **exact-input** swap between native USDC and WETH on Polygon. The existing QuoterV2 preview reports one v3 0.05% pool and is indicative only. The executable route will come from Uniswap Trading API. The standalone backend never holds a private key or broadcasts a user's transaction. Main Vezta integration and cross-chain swaps remain outside this spec.

## Integration decision

The user selected **Uniswap Trading API** on 2026-09-27. Keep the API key on `apps/api` only. Pin `x-universal-router-version: 2.1.2` throughout the quote, approval and swap journey; the [current Polygon deployment](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains) lists its 2.1.2 Universal Router. Limit this first release to same-chain `CLASSIC` AMM routes with `protocols: [V2, V3, V4]`, `routingPreference: BEST_PRICE`, and exact input. Polygon has no UniswapX route in the current support table, but still reject every unrecognized routing type. Use `permitAmount: EXACT`. The [official integration guide](https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide) and [Permit2 guide](https://developers.uniswap.org/docs/trading/swapping-api/concepts/permit2) govern the wallet flow. Live payload shape, route quality and API access still require verification with a real key before writes.

## Quote and signing flow

1. The UI takes wallet address, token direction, decimal amount, and slippage. It converts input with the selected token's on-chain-verified decimals; it never uses floating point for calldata. The server accepts only chain `137`, the two curated token addresses, a positive capped base-unit amount, and a valid Polygon wallet address.
2. The server calls Uniswap `/quote` with a server-side API key, fixed chain/token fields, exact input and explicit router version. It validates `CLASSIC`, input/output amounts, minimum amount, recipient, and route identity before returning a small read-only summary. A failed simulation or mismatched response is unavailable, not a tradeable quote. The existing QuoterV2 result remains labeled as a single-pool comparison.
3. Before any write, the browser checks chain, account, tokens, route, router/spender, amounts, minimum output, and deadline against visible intent. The quote expires after 30 seconds and on account/chain/input/slippage change. The indicative v3 preview cannot be used for execution.
4. Call `/check_approval` for the selected input token and exact amount. Validate any returned cancel/approval transaction before wallet submission. Wait for successful receipts, then request a fresh quote and require the user to review it again. If the new quote includes `permitData`, sign that exact EIP-712 payload and bind its signature to that quote only.
5. Call `/swap` with that quote and its matching permit/signature, validate the returned transaction's sender, chain, target, value, calldata and quote lifetime, then simulate from the user's address before wallet submission. Show separate approval, permit, swap pending, confirmed, rejected, reverted and timeout states. Refresh balances only after a successful receipt.

## Release gates

Wallet writes default to disabled until the runtime is checked on Polygon with a funded test wallet. Test wrong chain, decimals, insufficient token and gas balance, stale quote, changed amount, rejected approval/signature, router target mismatch, simulation revert, delayed receipt, and slippage revert. Record actual transaction gas and quote comparison to the Uniswap app for several trade sizes before enabling. No wallet secret enters environment files or tests.

## Trust and failure review

| Scenario | Asset / impact | Trust assumption | Mitigation and verification | Owner |
|---|---|---|---|---|
| Fake token or wrong chain | User sells wrong asset | Registry, RPC, wallet chain | Match exact chain/address/decimals; wrong-chain tests | Core + web |
| Altered quote or router target | Wrong spender or poor execution | API and browser payload | Reject mismatched API route or transaction; check the pinned Polygon router and simulate returned calldata; tamper tests | API + web |
| Price moves after quote/approval | Output below expectation or revert | Pool state changes | 30-second quote age, fresh post-approval quote, `amountOutMinimum`, deadline; stale tests | API + web |
| Insufficient balance/gas or rejected signature | Failed trade and confusing state | Wallet/RPC responses | Preflight balance and simulation, separate receipts; rejection/revert tests | Web |
| Public RPC outage or bad data | No quote or misleading preview | RPC response and freshness | Timestamp and block number; visible unavailable state; compare independent source before launch | API + web |

Unverified: live Trading API response and rate limits, reverse-direction depth, live router gas, wallet behavior, production RPC reliability, and any LP transaction path. These are blockers for enabling writes.
