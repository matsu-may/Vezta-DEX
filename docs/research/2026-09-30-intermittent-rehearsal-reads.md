# Intermittent local rehearsal reads

The owner observed both `/api/rehearsal/quote` and `/api/rehearsal/state` returning HTTP 503 intermittently, with HTTP 200 responses in between. A successful direct `wallet-state` request after restarting the API proved the endpoint is registered. A successful quote proves Uniswap and the local quote store can work, but neither success explains the intermittent failures.

`quote` calls Uniswap Trading API. `state` reads Polygon RPC and, when an exact token approval is needed, simulates that approval and estimates its gas. The web proxy collapses upstream failures into `Local rehearsal API unavailable`; direct port 3021 requests preserve safer diagnostic codes.

With the API restarted after this change, run this read-only probe from `vezta-dex/`:

```bash
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e node scripts/diagnose-rehearsal-reads.mjs
```

It makes four cycles of 1 USDC → WETH quote and wallet-state requests, spaced 1.25 seconds apart. It never signs or submits a transaction. Output includes only endpoint, status, elapsed milliseconds, a safe code, and upstream HTTP status when available; it omits balances, quote contents, response bodies, API keys and provider messages.

`TRADING_API_RATE_LIMITED` or `TRADING_API_HTTP_ERROR` implicates the Uniswap request. `TRADING_API_TIMEOUT` or `TRADING_API_NETWORK_ERROR` implicates its transport. `WALLET_STATE_BLOCK_UNAVAILABLE`, `ACCOUNT_CODE_UNAVAILABLE`, `READS_UNAVAILABLE`, `APPROVAL_SIMULATION_UNAVAILABLE`, and `APPROVAL_GAS_UNAVAILABLE` identify the failing Polygon RPC stage. `WALLET_STATE_STALE_BLOCK` indicates the returned block aged beyond the 120-second guard; `WALLET_STATE_NONCE_UNAVAILABLE` indicates pending and confirmed nonce mismatch or malformed nonce. A `networkError` means the local API itself could not be reached or timed out. A 503 with no code remains unclassified and needs API-side evidence before changes to RPC configuration or timeouts.

No root cause is established until a failing cycle is captured. Do not attempt a funded swap to diagnose these read-only failures.
