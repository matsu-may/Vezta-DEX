# Trading API live evidence — 2026-09-27

## Attempted read-only probe

`node scripts/smoke-trading-api.mjs` reads `UNISWAP_API_KEY` from ignored `apps/api/.env` and attempts two exact-input Polygon quotes, one second apart: 1 USDC to WETH and 0.001 WETH to USDC. It prints only HTTP status, error code, routing and field names. It never prints the key, raw response or signature. `DEX_SMOKE_WALLET` may select a public wallet address; no private key is needed.

Observed here: `{"direction":"USDC_TO_WETH","networkError":"TypeError"}` before any HTTP response. The script stopped before the second request. This is a local network restriction, **not** evidence that the key, endpoint, liquidity or schema is valid or invalid. No live API call is verified.

## Evidence to collect with network access

1. Run `node scripts/smoke-trading-api.mjs` from the `vezta-dex` root. Confirm both directions return HTTP 200 and `CLASSIC`, or record sanitized `errorCode`. A dummy wallet may yield balance/simulation errors; use a public address of a disposable funded wallet for executable quote evidence.
2. Record timestamp, chain, direction, input size, status, routing, top-level/quote field names, presence of `permitData` and `txFailureReasons`, and token/recipient/minimum-output matches. Redact payloads and credentials.
3. Inspect `/check_approval` only after quote shape is known. Run `node scripts/smoke-approval.mjs` from the owner's Terminal. It prints only transaction identity and decoded allowance category; it does not sign or submit. Keep writes disabled until allowance policy is agreed and tested.
4. Record any 429 and `Retry-After` without load testing the 6 RPS key. The [Uniswap API error guide](https://developers.uniswap.org/docs/trading/swapping-api/common-errors) documents 429 behavior.

**Gate status:** small live quotes verified in both directions below; approval and swap API shapes unverified; wallet execution disabled.

## Host Terminal result supplied by project owner

The same script subsequently ran in the owner's Terminal with working DNS. Both `USDC_TO_WETH` and `WETH_TO_USDC` returned **HTTP 200**, top-level `routing: CLASSIC`, and `hasPermitData: true`, one second apart. The top-level fields were `isTokenApprovalApplicable`, `permitData`, `permitTransaction`, `quote`, `requestId`, and `routing`. The quote included `chainId`, `tradeType`, `input`, `output`, `swapper`, `route`, `quoteId`, gas estimates, and `txFailureReasons` (plural). Both directions returned input `amount`/`token` and output `amount`/`minimumAmount`/`recipient`/`token` fields.

The first script version checked only singular `txFailureReason`, so its initial `hasTxFailureReason: false` was insufficient. The owner reran the corrected script. Both directions again returned HTTP 200 and `CLASSIC`; `quoteChainId: 137`, `quoteTradeType: EXACT_INPUT`, `inputMatches: true`, `outputMatches: true`, `minimumOutputValid: true`, `failureReasonCount: 0`, and `hasTxFailureReason: false`. This verifies the key, response identity and clean simulation status for the **two small probe amounts**. It does not establish quote quality at larger sizes, account balance, gas sufficiency or an executable wallet transaction. Approval calldata, allowance policy, swap preparation and browser wallet behavior remain unverified. Wallet execution stays disabled.

The next read-only check follows the [official approval endpoint](https://developers.uniswap.org/docs/api-reference/check_approval) and compares any returned ERC20 approval to the [canonical Permit2 address on Polygon](https://developers.uniswap.org/docs/protocols/permit2/overview). Its result must be inspected before choosing whether exact, greater-than-request or unlimited approval is acceptable to the product.
