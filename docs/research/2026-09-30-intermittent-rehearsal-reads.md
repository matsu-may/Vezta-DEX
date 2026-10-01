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

## Owner's direct API result

Four quote requests returned HTTP 200 (2.3–4.2 seconds). Wallet state returned HTTP 200 once (1.6 seconds), then HTTP 503 three times with `WALLET_STATE_BLOCK_UNAVAILABLE` (16.5 seconds, 0.7 seconds, 0.7 seconds). The failure is before balance, allowance and approval simulation reads. `getBlock()` first calls `eth_chainId`, then `eth_getBlockByNumber("latest", false)` through viem with an 8-second timeout and one retry. The 16.5-second duration is consistent with exhausted retries, while the shorter failures could be immediate HTTP or JSON-RPC errors. These timings do not identify which RPC method failed or prove the provider's reason.

The original RPC hostname was `polygon-bor-rpc.publicnode.com`. Run `node scripts/diagnose-polygon-rpc.mjs` on the same machine to probe the two methods separately using the URL currently in `apps/api/.env`. It performs five cycles with 1.25 seconds between requests, no wallet or key required, and prints only method, status, elapsed time, safe numeric RPC error code, and whether the result has the expected shape. It never prints the RPC URL or response message. This probes single attempts; the app's viem transport may retry each failure once.

## Owner's direct RPC result

`eth_chainId` returned HTTP 200 with a valid Polygon chain ID in 5/5 cycles (229–465 ms). `eth_getBlockByNumber("latest", false)` returned valid HTTP 200 in 3/5 cycles (378–2,948 ms) and timed out at 8,004 and 8,013 ms in 2/5 cycles. This directly reproduces an intermittent latest-block read failure in the configured RPC path. It explains the wallet-state block errors observed above; it does **not** prove whether the cause is provider load, local network path or both. A larger timeout cannot be assumed safe because the local web proxy's whole-request budget is 18 seconds and later pinned reads still need time.

**Decision for now:** keep transaction preparation fail-closed and do not add an unverified public RPC fallback. Qualify the replacement endpoint with repeated latest-block, pinned balance/allowance and receipt reads before a funded rehearsal. Record latency and status without sharing any credential-bearing URL. The read-only LP probe can proceed independently.

**2026-10-01 qualification:** `node scripts/diagnose-polygon-rpc-qualified.mjs` performs read-only checks for Polygon chain ID, a fresh recent block with a transaction, USDC `balanceOf` and `allowance` at that exact block, that transaction's receipt, then a second read of the block hash. It reports only booleans, stage, per-method elapsed time and a public block number. A latest empty block may be skipped for one of the prior two blocks. The owner's host returned 3/3 complete cycles with every check `true` at blocks `0x5a5b597`, `0x5a5b599` and `0x5a5b59b`. Total durations were 2,196, 1,986 and 1,908 ms; the slowest individual call was the first chain read at 553 ms. No transaction was sent. This qualifies the pinned read/receipt response path in a small sample; the earlier 13.1-second wallet-state tail and long-term availability remain open.

To localize the earlier wallet-state tail, run `pnpm --filter @vezta-dex/api exec node --import tsx src/diagnose-wallet-state-cli.ts` from the `vezta-dex` root after setting `POLYGON_RPC_URL` in `apps/api/.env`. It runs three read-only 1-USDC intent observations and prints method call counts, durations, safe failure codes and total time. It does not print balances, wallet addresses, provider errors or calldata. It may simulate an unsigned ERC20 approval and estimate gas; it never signs or broadcasts. The default public test EOA can be overridden with `DEX_SMOKE_WALLET`. This timing probe awaits all parallel reads after a failure, so a fast reject cannot hide a slower in-flight method.

**Owner host result, 2026-10-01:** all three wallet-state cycles returned `ok`, in 4,924, 788 and 795 ms. The first cycle spent 2,683 ms in `getBlock`, then concurrent balance/allowance/nonce/Permit2 calls each took up to 1,856 ms; approval simulation and gas calls took 69–70 ms each. In cycles two and three, `getBlock` took 154 and 152 ms and the complete observations stayed below 0.8 seconds. The first cycle is slower but within the local 18-second proxy budget. These timings do not reproduce or explain the earlier 13.1-second tail and do not prove that the provider has a stable latency ceiling. No timeout, retry or RPC fallback policy changes follow from this three-cycle sample.

## Owner's replacement-RPC preflight

After changing the Polygon RPC URL locally, the owner ran the direct probe three times. All 15 `eth_chainId` and 15 `eth_getBlockByNumber("latest", false)` calls returned valid HTTP 200; the slowest block response was 354 ms. With the API restarted, four wallet-state requests returned HTTP 200 (3,492–13,141 ms). This is evidence that the former repeated block-read failure did not recur in this sample. The 13.1-second state tail still needs attention within the 18-second local proxy budget; this sample does not establish long-term RPC availability.

In the same four-cycle local probe, three Trading API quotes returned HTTP 200 (2,199–5,192 ms) and one returned HTTP 503 after 8,015 ms with `TRADING_API_TIMEOUT`. The Trading API client has an 8-second abort timeout. That safe code identifies a timed-out Trading API transport, not whether Uniswap processing or the owner's network caused it. Do not label the replacement RPC as the cause of this quote timeout, increase timeouts from one sample, or start a funded swap. Next compare a direct read-only Trading API probe with repeated local quote/state cycles; preserve safe status and latency only.

## Follow-up read-only checks

The owner then ran `scripts/smoke-trading-api.mjs`: both USDC → WETH and WETH → USDC returned HTTP 200, `CLASSIC` hook-free policy matched, exact Permit2 amount and deadlines validated, and neither quote carried a transaction failure reason. Two more four-cycle local runs returned **8/8 quote** and **8/8 wallet-state** HTTP 200 with data. In those runs, quotes took 2,415–3,686 ms and state reads 3,011–5,020 ms. Across all replacement-RPC local runs, state is 12/12 successful; quotes are 11/12 successful with the single prior 8-second Trading API timeout. This is a useful local recovery signal, not an uptime guarantee or a funded-execution test. Do not infer that increasing the eight-second timeout is required from the isolated failure.
