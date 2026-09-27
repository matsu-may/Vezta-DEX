# Trading API live evidence — 2026-09-27

## Attempted read-only probe

`node scripts/smoke-trading-api.mjs` reads `UNISWAP_API_KEY` from ignored `apps/api/.env` and attempts two exact-input Polygon quotes, one second apart: 1 USDC to WETH and 0.001 WETH to USDC. It prints only HTTP status, error code, routing and field names. It never prints the key, raw response or signature. `DEX_SMOKE_WALLET` may select a public wallet address; no private key is needed.

Observed here: `{"direction":"USDC_TO_WETH","networkError":"TypeError"}` before any HTTP response. The script stopped before the second request. This is a local network restriction, **not** evidence that the key, endpoint, liquidity or schema is valid or invalid. No live API call is verified.

## Evidence to collect with network access

1. Run `node scripts/smoke-trading-api.mjs` from the `vezta-dex` root. Confirm both directions return HTTP 200 and `CLASSIC`, or record sanitized `errorCode`. A dummy wallet may yield balance/simulation errors; use a public address of a disposable funded wallet for executable quote evidence.
2. Record timestamp, chain, direction, input size, status, routing, top-level/quote field names, presence of `permitData` and `txFailureReasons`, and token/recipient/minimum-output matches. Redact payloads and credentials.
3. Inspect `/check_approval` only after quote shape is known. Run `node scripts/smoke-approval.mjs` from the owner's Terminal. It prints only transaction identity and decoded allowance category; it does not sign or submit. Keep writes disabled until allowance policy is agreed and tested.
4. Record any 429 and `Retry-After` without load testing the 6 RPS key. The [Uniswap API error guide](https://developers.uniswap.org/docs/trading/swapping-api/common-errors) documents 429 behavior.

**Gate status:** small live quotes and read-only approval plans verified in both directions below; swap preparation and wallet execution remain unverified and disabled.

## Host Terminal result supplied by project owner

The same script subsequently ran in the owner's Terminal with working DNS. Both `USDC_TO_WETH` and `WETH_TO_USDC` returned **HTTP 200**, top-level `routing: CLASSIC`, and `hasPermitData: true`, one second apart. The top-level fields were `isTokenApprovalApplicable`, `permitData`, `permitTransaction`, `quote`, `requestId`, and `routing`. The quote included `chainId`, `tradeType`, `input`, `output`, `swapper`, `route`, `quoteId`, gas estimates, and `txFailureReasons` (plural). Both directions returned input `amount`/`token` and output `amount`/`minimumAmount`/`recipient`/`token` fields.

The first script version checked only singular `txFailureReason`, so its initial `hasTxFailureReason: false` was insufficient. The owner reran the corrected script. Both directions again returned HTTP 200 and `CLASSIC`; `quoteChainId: 137`, `quoteTradeType: EXACT_INPUT`, `inputMatches: true`, `outputMatches: true`, `minimumOutputValid: true`, `failureReasonCount: 0`, and `hasTxFailureReason: false`. This verifies the key, response identity and clean simulation status for the **two small probe amounts**. It does not establish quote quality at larger sizes, account balance, gas sufficiency or an executable wallet transaction. Approval calldata, allowance policy, swap preparation and browser wallet behavior remain unverified. Wallet execution stays disabled.

The next read-only check follows the [official approval endpoint](https://developers.uniswap.org/docs/api-reference/check_approval) and compares any returned ERC20 approval to the [canonical Permit2 address on Polygon](https://developers.uniswap.org/docs/protocols/permit2/overview). Its result must be inspected before choosing whether exact, greater-than-request or unlimited approval is acceptable to the product.

## Approval probe supplied by project owner

`node scripts/smoke-approval.mjs` returned HTTP 200 for native USDC and WETH using the script's public dummy wallet. Both responses contained an `approval` transaction and no `cancel` transaction. The decoded proposals matched Polygon 137, the requested wallet and token, zero native value, standard ERC20 `approve(address,uint256)`, and the canonical Permit2 spender `0x000000000022D473030F116dDEE9F6B43aC78BA3`. **Both approval amounts were `uint256.max` (unlimited)**, despite `/quote` using `permitAmount: EXACT`. No transaction was signed or submitted.

This is an ERC20-to-Permit2 standing allowance decision, separate from the amount-limited Permit2 signature. The default API-generated approval cannot be passed to the wallet silently. Approval behavior for an already-approved real wallet and cancel-first tokens remains unverified.

**Owner decision:** Vezta will ask for ERC20 approval of exactly the swap input amount to Permit2 for each swap. The API's unlimited approval transaction is never forwarded. Existing nonzero allowances that differ from the selected input amount require a separate review/reset flow and remain blocked for the first wallet-write slice. This policy still needs a small live compatibility test before enabling transaction submission.

## Exact approval-plan probe supplied by project owner

After a clean `pnpm install` and local API start, `node scripts/smoke-approval-plan.mjs` returned HTTP 200 for native USDC and WETH on Polygon 137. The script used its public dummy wallet unless `DEX_SMOKE_WALLET` was overridden; the supplied output does not identify a real funded wallet. Both allowance reads were `zero`, pinned to blocks `94544786` and `94544787` (observed at `2026-09-27T15:18:39Z` and `2026-09-27T15:18:41Z`). Both plans were `approve`. Decoding each unsigned transaction confirmed the requested wallet as sender, selected input token as target, zero native value, standard ERC20 `approve`, canonical Permit2 spender `0x000000000022d473030f116ddee9f6b43ac78ba3`, and **exact** allowance equal to the respective requested input amount. No transaction was signed or submitted.

This verifies the live RPC allowance path and transaction construction for zero allowance in both directions. It does not verify a nonzero allowance branch on a live wallet, token approval receipt, Permit2 signature, `/swap` payload, gas sufficiency, or swap receipt. Wallet writes remain disabled.
