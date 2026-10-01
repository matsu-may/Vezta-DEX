# Local API Readiness and Request Logs — 2026-10-01

This is a standalone local-operation slice, not a public release gate. It answers two immediate questions: **is the API process responding?** and **can the configured Polygon RPC return a recent block on the expected chain?** `/health` answers only the first; `/ready` checks the second. The production chain source checks `chainId=137`, and readiness rejects a missing/zero block, a block older than 120 seconds, or a timestamp over five seconds in the future. It returns only `ready`/`unavailable`, with HTTP 200/503. A five-second cache and shared in-flight probe avoid multiplying RPC calls during health polling.

The API now writes one JSON line per request with a generated `X-Request-Id`, allowlisted route label, GET/POST/OTHER method, HTTP status and elapsed milliseconds. This answers which local route failed and how long it took. The log does not include the raw URL, query, wallet address, headers, body, provider message, API key, signature or calldata. `GET /api/v1/pools/<id>` is logged only as `pool_detail`. Example local checks:

```bash
curl -i http://127.0.0.1:3021/health
curl -i http://127.0.0.1:3021/ready
```

`/ready` does **not** probe Uniswap Trading/LP API, pinned contract reads, simulation, wallet submission or receipt observation. A passing response cannot authorize wallet writes. Logs currently go to process stdout; there is no durable metrics backend, alert, upstream latency breakdown or cross-service trace. Keep those items open for a standalone deployment design, along with direct-endpoint access control and shared quota/state.
