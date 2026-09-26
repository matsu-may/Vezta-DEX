# Polygon Single-Pool Swap — Design Spec

## Intent and boundary

Let a user preview and eventually sign an **exact-input** swap between native USDC and WETH on Polygon through the researched Uniswap v3 0.05% pool. This is the first narrowly bounded transaction path; it is not best-route aggregation. The standalone backend never holds a private key or broadcasts a user's transaction. Main Vezta integration and cross-chain swaps remain outside this spec.

## Integration decision

Use the Polygon v3 factory and QuoterV2 for the **read-only preview**. Wallet execution has an open integration decision: either the officially deployed v3 SwapRouter for this one pool, or Uniswap's hosted Trading API for broader routing. The direct router needs no hosted API key and gives a small, inspectable path, but cannot find a better route. The hosted API requires access and introduces a service dependency; its Polygon route quality and exact transaction payload need live evaluation. The [official deployment list](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments) is the source for QuoterV2 and router addresses. Uniswap's [single-swap guide](https://developers.uniswap.org/docs/protocols/v3/guides/swapping/single-hop-swapping) defines the direct exact-input parameters. Select the write path with the user before implementing approval or signing.

## Quote and signing flow

1. The UI takes token direction, decimal amount, and slippage. It converts input with the selected token's on-chain-verified decimals; it never uses floating point for calldata. The API accepts only chain `137`, the two curated token addresses, positive integer base-unit amount, and fee `500`.
2. The API reads one current Polygon block, confirms the factory pool address, and calls QuoterV2 for exact input. It returns raw amount in/out, pool, fee, block, timestamp, quote age and quote-only gas estimate. It does not call this number transaction gas or report price impact without a defensible reference price.
3. Before any write, the browser checks chain, account, tokens, route, router/spender, amounts, minimum output, and deadline against visible intent. The quote expires after 30 seconds and on account/chain/input/slippage change. A quote from the preview cannot be reused as a different execution route without a new user review.
4. If allowance is insufficient, the wallet approves **only the needed amount** for the verified spender selected by the execution route. Wait for a successful approval receipt, then request a fresh quote and require the user to review it again.
5. Simulate the selected swap call from the user's address, then ask the wallet to submit. Show separate approval, swap pending, confirmed, rejected, reverted and timeout states. Refresh balances only after a successful receipt.

## Release gates

Wallet writes default to disabled until the runtime is checked on Polygon with a funded test wallet. Test wrong chain, decimals, insufficient token and gas balance, stale quote, changed amount, rejected approval/signature, router target mismatch, simulation revert, delayed receipt, and slippage revert. Record actual transaction gas and quote comparison to the Uniswap app for several trade sizes before enabling. No wallet secret enters environment files or tests.

## Trust and failure review

| Scenario | Asset / impact | Trust assumption | Mitigation and verification | Owner |
|---|---|---|---|---|
| Fake token or wrong chain | User sells wrong asset | Registry, RPC, wallet chain | Match exact chain/address/decimals; wrong-chain tests | Core + web |
| Altered quote or router target | Wrong spender or poor execution | API and browser payload | Browser builds calldata from fixed registry and validates quote identity; tamper tests | Web |
| Price moves after quote/approval | Output below expectation or revert | Pool state changes | 30-second quote age, fresh post-approval quote, `amountOutMinimum`, deadline; stale tests | API + web |
| Insufficient balance/gas or rejected signature | Failed trade and confusing state | Wallet/RPC responses | Preflight balance and simulation, separate receipts; rejection/revert tests | Web |
| Public RPC outage or bad data | No quote or misleading preview | RPC response and freshness | Timestamp and block number; visible unavailable state; compare independent source before launch | API + web |

Unverified: reverse-direction depth, live router gas, wallet behavior, production RPC reliability, and any LP transaction path. These are blockers for enabling writes, not evidence that this spec is complete in production.
