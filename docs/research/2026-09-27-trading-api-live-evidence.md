# Trading API live evidence — 2026-09-27

## Attempted read-only probe

`node scripts/smoke-trading-api.mjs` reads `UNISWAP_API_KEY` from ignored `apps/api/.env` and attempts two exact-input Polygon quotes, one second apart: 1 USDC to WETH and 0.001 WETH to USDC. It prints only HTTP status, error code, routing and field names. It never prints the key, raw response or signature. `DEX_SMOKE_WALLET` may select a public wallet address; no private key is needed.

Observed here: `{"direction":"USDC_TO_WETH","networkError":"TypeError"}` before any HTTP response. The script stopped before the second request. This is a local network restriction, **not** evidence that the key, endpoint, liquidity or schema is valid or invalid. No live API call is verified.

## Evidence to collect with network access

1. Run `node scripts/smoke-trading-api.mjs` from the `vezta-dex` root. Confirm both directions return HTTP 200 and `CLASSIC`, or record sanitized `errorCode`. A dummy wallet may yield balance/simulation errors; use a public address of a disposable funded wallet for executable quote evidence.
2. Record timestamp, chain, direction, input size, status, routing, top-level/quote field names, presence of `permitData` and `txFailureReason`, and token/recipient/minimum-output matches. Redact payloads and credentials.
3. Inspect `/check_approval` only after quote shape is known. Decode approval amount, spender and any cancel transaction. Keep writes disabled until allowance policy is agreed and tested.
4. Record any 429 and `Retry-After` without load testing the 6 RPS key. The [Uniswap API error guide](https://developers.uniswap.org/docs/trading/swapping-api/common-errors) documents 429 behavior.

**Gate status:** live quote, approval and swap API shapes unverified; wallet execution disabled.

## Host Terminal result supplied by project owner

The same script subsequently ran in the owner's Terminal with working DNS. Both `USDC_TO_WETH` and `WETH_TO_USDC` returned **HTTP 200**, top-level `routing: CLASSIC`, and `hasPermitData: true`, one second apart. The top-level fields were `isTokenApprovalApplicable`, `permitData`, `permitTransaction`, `quote`, `requestId`, and `routing`. The quote included `chainId`, `tradeType`, `input`, `output`, `swapper`, `route`, `quoteId`, gas estimates, and `txFailureReasons` (plural). Both directions returned input `amount`/`token` and output `amount`/`minimumAmount`/`recipient`/`token` fields.

This confirms key access and route availability for the two small probe amounts. It does **not** prove that quoted amounts, chain, recipient, minimum output or simulation status matched the request: the first script only printed field names and checked singular `txFailureReason`. Its `hasTxFailureReason: false` result therefore did not inspect `txFailureReasons`. The script and quote parser have since been corrected; rerun the script to obtain sanitized validation booleans and the failure-reason count. Approval calldata, allowance policy, executable swap and browser wallet behavior remain unverified. Wallet execution stays disabled.
