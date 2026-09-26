# Polygon Uniswap Trading API Swap — Design Spec

## Goal and release boundary

The standalone DEX first previews an exact-input swap between native USDC and WETH on Polygon (`chainId: 137`). A later release may let the connected wallet approve, sign and submit a `CLASSIC` Uniswap route. The existing QuoterV2 v3 0.05% quote is indicative and cannot be executed. Main Vezta integration, LP writes, other chains and cross-chain swaps are separate work. The backend holds the Uniswap API key but never a wallet key. The wallet signs and broadcasts every transaction. No write control is enabled until the live evidence gates below pass.

## Fixed identities and request contract

| Item | Required value |
|---|---|
| Chain | Polygon `137` |
| Tokens | Native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals); WETH `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619` (18 decimals) |
| Route | `CLASSIC`, exact input, V2/V3/V4, `BEST_PRICE` |
| Router | Universal Router `2.1.2`, `0xDc264714F68d84CF29BC605589405E78bDBE7C9f` on Polygon |
| Slippage | 10–300 bps; integer base units only |
| Quote lifetime | 30 seconds from request start; refresh after approval |

Validate chain, token pair, account, integer amount and slippage before contacting Uniswap. `/quote` uses `permitAmount: EXACT`, `swapper` and `recipient` equal to the account, and the router-version header. Use that header on `/quote` and `/swap` where documented; do not assume `/check_approval` accepts it. Reject unknown routing, mismatched tokens/amount/recipient, missing minimum output, failed simulation or malformed response. Send only a bounded summary to the browser. Keep the key, raw upstream errors and sensitive payloads out of logs and client responses.

## API budget and availability

The supplied key is limited to **6 requests/second across every endpoint and process**. A single-process server dispatches at most **5 requests/second**, at least 200 ms apart, with a bounded queue. Pending approval/swap preparation gets priority over new previews; requests already in flight cannot be preempted. The UI does not poll quotes. Queue saturation returns a controlled unavailable response. HTTP 429 pauses *all* calls using the key according to `Retry-After` or a conservative fallback. Retry uses a fresh user intent; never automatically replay a signed request.

An in-memory limiter protects only one process. Public multi-instance deployment or another key consumer requires a shared Redis limiter or centralized gateway, plus per-client abuse protection. Five RPS locally is not a global guarantee when replicas exist. Measure queue time and 429 counts without logging credentials or quote payloads.

## Quote identity and server state

The future write path keeps the complete upstream quote in a **short-lived server-side store** keyed by an opaque random ID. Bind it to account, chain, token pair, amount, slippage, router version and creation time; expire at 30 seconds and consume at most once for `/swap`. The browser sends the ID, never a replacement raw quote. Bounded memory suffices for one process; replicas require a shared TTL store. After approval, invalidate the old quote, fetch a new one and require explicit review. Do not log Permit2 signatures or full quotes. The current read-only endpoint does **not** implement this store; it is required before writes.

## Wallet state machine

| State | Entry and visible behavior | Exit / invalidation |
|---|---|---|
| Disconnected / wrong chain | Ask to connect or switch to Polygon | Verified account and chain |
| Quote pending / unavailable | Loading or controlled error; no wallet prompt | Fresh validated quote |
| Quote fresh | Show input, minimum output, route and age | Review, expiry or changed account/chain/token/amount/slippage |
| Approval check / cancel required | Query allowance; explain any cancel transaction separately | Validated transaction or no approval needed |
| Approval pending | Show wallet and receipt status | Confirmed receipt, rejection, revert or timeout |
| New quote review | Fetch after approval and show changed output | User accepts a fresh quote |
| Permit signing | Sign typed data from this quote only; single-use signature | Signature or rejection; invalidate on quote change |
| Swap preparation / simulation | Validate calldata and simulate from wallet account | Valid transaction or visible failure |
| Swap pending | Show hash and explorer link | Confirmed receipt, reverted receipt or timeout |
| Confirmed / failed | Refresh balances only after confirmation | New intent |

Rejection, revert and timeout are different outcomes. Timeout is not proof of failure: keep checking the transaction hash. Any input/account/chain change during a wallet prompt invalidates the intent and requires a new quote.

## Approval and transaction validation

`permitAmount: EXACT` scopes the Permit2 signature requested from the quote. It **does not prove** that ERC20 approval to Permit2 is exact or short lived. Inspect live `/check_approval` and calldata, including cancel-first flows, before offering approval. Do not silently submit unlimited or long-lived approval. If required, stop and agree on policy and user wording before enabling wallet writes.

For every returned wallet transaction, verify Polygon chain, sender/account, target against the official router or approved spender, nonempty calldata, and value `0` for ERC20 input. Decode approval calldata and enforce token, spender and amount policy. Bind `/swap` to the saved quote and matching Permit2 signature; never reuse a signature with another quote. Verify deadline and minimum output against visible intent, simulate from the wallet account, and inspect final receipt status. Simulation success is not confirmation.

## Verification gates

1. Run the read-only smoke script with a key in ignored `apps/api/.env`; record sanitized status, routing and field names in both directions. Validate actual API errors without exceeding 6 RPS. Outbound sockets are blocked here, so this gate is **open**.
2. Test decimal precision, wrong chain/token/account, stale quote, queue saturation, 429 pause, mismatched router/spender, replayed permit, insufficient token/gas, rejection, revert and delayed receipt.
3. With a disposable funded Polygon wallet, browser-check a small real approval and swap. Record transaction hashes, gas, receipt status and quoted-versus-executed amount. Never record a secret or signature.
4. Compare representative sizes and both directions with the Uniswap app. Enable writes only after these checks and independent code review.

## Sources and unknowns

Use the official [integration guide](https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide), [Permit2 guide](https://developers.uniswap.org/docs/trading/swapping-api/concepts/permit2), [supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains), [approval API](https://developers.uniswap.org/docs/api-reference/check_approval), and [API errors](https://developers.uniswap.org/docs/trading/swapping-api/common-errors). Live response shape, approval amount, reverse-direction depth, gas, wallet behavior and production RPC reliability remain unverified.
