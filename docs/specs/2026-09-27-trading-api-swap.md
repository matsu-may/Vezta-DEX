# Polygon Uniswap Trading API Swap — Design Spec

## Goal and release boundary

The standalone DEX first previews an exact-input swap between native USDC and WETH on Polygon (`chainId: 137`). A later release may let the connected wallet approve, sign and submit a `CLASSIC` Uniswap route. The existing QuoterV2 v3 0.05% quote is indicative and cannot be executed. Main Vezta integration, LP writes, other chains and cross-chain swaps are separate work. The backend holds the Uniswap API key but never a wallet key. The wallet signs and broadcasts every transaction. No write control is enabled until the live evidence gates below pass.

## Fixed identities and request contract

| Item | Required value |
|---|---|
| Chain | Polygon `137` |
| Tokens | Native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals); WETH `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619` (18 decimals) |
| Route | `CLASSIC`, exact input, V2/V3/V4, `BEST_PRICE`, `hooksOptions: V4_NO_HOOKS` |
| Router | Universal Router `2.1.2`, `0xDc264714F68d84CF29BC605589405E78bDBE7C9f` on Polygon |
| Slippage | 10–300 bps; integer base units only |
| Quote lifetime | 30 seconds from request start; refresh after approval |

Validate chain, token pair, account, integer amount and slippage before contacting Uniswap. `/quote` uses `permitAmount: EXACT`, `swapper` and `recipient` equal to the account, and the router-version header. Use that header on `/quote` and `/swap` where documented; do not assume `/check_approval` accepts it. Reject unknown routing, mismatched tokens/amount/recipient, missing minimum output, failed simulation or malformed response. Quote previews return only a bounded summary and opaque ID. A separate permit plan may return validated signing data, without the raw quote. Keep the key, raw upstream errors and sensitive payloads out of logs and client responses.

## Hook policy selected on 2026-09-28

The owner selected V2/V3 plus hook-free V4. Request `hooksOptions: V4_NO_HOOKS` explicitly and inspect every returned route branch and hop before storage. Require supported pool type, pool reference, Polygon currency metadata, continuous path and matching endpoints. V4 requires an explicit zero `hooks` address. Missing or contradictory metadata fails closed; never fall back to inclusive hooks. This verifies quote metadata only; calldata and contract provenance remain wallet-write gates. See [policy evidence and approved Permit2 decision](../research/2026-09-28-hook-free-routing-and-permit-policy.md).

## Permit2 policy approved on 2026-09-28 (option 1)

Keep the standard API PermitSingle message unchanged. Require the Permit2 domain (`name: Permit2`, numeric `chainId: 137`, canonical Permit2 contract), the exact canonical ordered PermitSingle/PermitDetails types, the input token, `amountIn`, Universal Router 2.1.2 spender and the current owner/token/spender uint48 nonce. Reject missing, extra or altered signed fields and unsafe integers. A string domain chain ID is rejected because viem 2.47.18 omits it when inferring EIP712Domain types. Verify nonce from a pinned recent Polygon block before presenting any message.

The maximum remaining Permit2 allowance lifetime is **2,592,000 seconds (30 days)** and signature deadline is **1,800 seconds (30 minutes)** at validation time. Both must remain unexpired. These clocks do not extend the application quote's **30 seconds from request start**. Reject the quote if it expires during RPC reads or a wallet prompt. Never reuse a signature for another quote. Exact ERC20 approval remains a separate prerequisite.

The first message adapter accepts timestamp expiration only. `expiration=0` has execution-block semantics on-chain, but is unsupported here and is rejected without modifying the message. On-chain `permitTransaction` flows are also unsupported in this slice. If `permitData` is null, inspect the actual router allowance; only an exact, unexpired allowance within the 30-day cap may be considered ready. Otherwise report a blocked existing-allowance state; do not create, revoke or reuse a larger permission automatically.

PermitSingle grants spender permission; it does **not** cryptographically bind output token, recipient or minimum received. Vezta's saved quote binds that intent, and future swap calldata validation must independently enforce it. A nonce snapshot is not a reservation. Recheck policy and chain state before subsequent writes. The read-only permit plan does not establish that ERC20 approval is ready, that a signature is valid, or that swap simulation/receipt gates have passed.

## API budget and availability

The supplied key is limited to **6 requests/second across every endpoint and process**. A single-process server dispatches at most **5 requests/second**, at least 200 ms apart, with a bounded queue. Pending approval/swap preparation gets priority over new previews; requests already in flight cannot be preempted. The UI does not poll quotes. Queue saturation returns a controlled unavailable response. HTTP 429 pauses *all* calls using the key according to `Retry-After` or a conservative fallback. Retry uses a fresh user intent; never automatically replay a signed request.

An in-memory limiter protects only one process. Public multi-instance deployment or another key consumer requires a shared Redis limiter or centralized gateway, plus per-client abuse protection. Five RPS locally is not a global guarantee when replicas exist. Measure queue time and 429 counts without logging credentials or quote payloads.

## Quote identity and server state

The API now keeps the complete upstream quote in a **short-lived server-side store** keyed by an opaque random ID. It binds account, chain, token pair, amount, slippage and router version, expires 30 seconds from request start, and permits one consume. The browser receives only the ID and validated summary, never the raw quote. The current store is bounded to 128 entries and 256 KB per upstream payload in one process; replicas require a shared TTL store before public use. After approval, invalidate the old quote, fetch a new one and require explicit review. Do not log Permit2 signatures or full quotes. `POST /api/v1/permit-plan` reads the same bound quote without consuming or renewing it and returns validated PermitSingle data plus block/expiry provenance. No `/swap` consumer or wallet write is enabled yet. See [Permit2 validation and host probe](../research/2026-09-28-permit2-standard-policy-validation.md).

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

The read-only Polygon probe returned `uint256.max` ERC20 approvals to canonical Permit2 for both curated tokens and no cancellation. No approval was submitted. **Decision, 2026-09-27: approve exactly `amountIn` per swap.** Ignore the API-generated unlimited approval transaction. Build `approve(Permit2, amountIn)` against the selected ERC20 contract, validate the calldata, then recheck on-chain allowance and request a fresh quote after its receipt. The exact approval normally adds gas for later swaps, but avoids asking Vezta users for a new standing unlimited ERC20 allowance. Keep `permitAmount: EXACT` for the separate quote-bound Permit2 signature.

Before preparing an approval, read `allowance(account, Permit2)` on Polygon. If it is zero, prepare the exact approval. If it already equals `amountIn`, it may be reused after confirming the account and token. If it is any other nonzero value, show the existing allowance and stop; do not silently reuse it or auto-revoke it. A later explicit revoke/reset flow must account for tokens that require zero-first approval. This conservative edge case is a usability limitation until browser tests settle the reset flow. Do not expose a wallet write control until the exact path is tested with a disposable funded wallet.

`POST /api/v1/approval-plan` is a **read-only preparation endpoint**. It validates the curated intent, reads ERC20 allowance at a pinned recent Polygon block, and returns `approve`, `ready` or `blocked-existing`. The `approve` case contains an unsigned transaction targeting the selected input token with `approve(canonical Permit2, amountIn)` and zero native value. The web app does not submit it. Recheck account, chain and allowance immediately before any future wallet prompt; this block snapshot is not a reservation.

The owner's live read-only smoke run returned zero allowance and a decoded exact `approve` plan for both native USDC and WETH (Polygon blocks `94544786`–`94544787`). This establishes the zero-allowance preparation path only; a funded-wallet receipt and post-approval requote are still required before enabling writes. See [live evidence](../research/2026-09-27-trading-api-live-evidence.md).

For every returned wallet transaction, verify Polygon chain, sender/account, target against the official router or approved spender, nonempty calldata, and value `0` for ERC20 input. Decode approval calldata and enforce token, spender and amount policy. Bind `/swap` to the saved quote and matching Permit2 signature; never reuse a signature with another quote. Verify deadline and minimum output against visible intent, simulate from the wallet account, and inspect final receipt status. Simulation success is not confirmation.

## Verification gates

1. Run the read-only smoke script with a key in ignored `apps/api/.env`; record sanitized status, routing, identity checks and simulation-failure count in both directions. Both small probes returned HTTP 200 and `CLASSIC`, matched the Polygon exact-input intent, and reported zero simulation failures from the owner's Terminal. API error/429 behavior remains unverified live. Outbound sockets remain blocked in this sandbox.
2. Test decimal precision, wrong chain/token/account, stale quote, queue saturation, 429 pause, mismatched router/spender, replayed permit, insufficient token/gas, rejection, revert and delayed receipt.
3. With a disposable funded Polygon wallet, browser-check a small real approval and swap. Record transaction hashes, gas, receipt status and quoted-versus-executed amount. Never record a secret or signature.
4. Compare representative sizes and both directions with the Uniswap app. Enable writes only after these checks and independent code review.

## Sources and unknowns

Use the official [integration guide](https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide), [quote API](https://developers.uniswap.org/docs/api-reference/aggregator_quote), [Permit2 guide](https://developers.uniswap.org/docs/trading/swapping-api/concepts/permit2), [supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains), [approval API](https://developers.uniswap.org/docs/api-reference/check_approval), and [API errors](https://developers.uniswap.org/docs/trading/swapping-api/common-errors). Small quote identities and the API's unlimited approval proposals were observed in both directions; exact approval compatibility, deeper trade sizes, gas, wallet behavior and production RPC reliability remain unverified.
