# Base Sepolia testnet preflight — 2026-10-01

The isolated testnet candidate uses Circle-issued **testnet** USDC and WETH on Base Sepolia 84532. No real USDC, wallet signature or testnet transaction is involved in these diagnostics. Address and contract provenance: [Circle testnet USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Uniswap v3 Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [Trading API testnet support](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

## Run on a host with Base Sepolia RPC access

In `apps/api/.env`, set `BASE_SEPOLIA_RPC_URL` to a trusted Base Sepolia HTTPS RPC (the example uses `https://sepolia.base.org`). Then, from `vezta-dex/`:

```bash
pnpm testnet:preflight
```

The command reads chain ID, one fresh block, contract code, on-chain token decimals, v3 factory pools at fee tiers 100/500/3000/10000, pool identity/initialization/liquidity, and a QuoterV2 1-test-USDC → WETH quote. It confirms the pinned block hash again. `readOnlyQualified: true` requires at least one matching pool with a positive quote. It prints only chain, block, pool address/fee, bounded quote amount and status; it never prints the RPC URL. A nonzero exit and `RPC_UNAVAILABLE`, `WRONG_CHAIN`, `STALE_BLOCK`, `TOKEN_DECIMALS`, `POOL_IDENTITY`, `MISSING_CODE`, `BLOCK_CHANGED` or `readOnlyQualified:false` means stop before a write. A quoted pool still needs price-impact, gas and wallet checks.

After a qualifying pool is found and `UNISWAP_API_KEY` is set server-side in `apps/api/.env`, run:

```bash
pnpm testnet:quote-probe
```

This repeats the pool preflight and requests a `CLASSIC` v3 quote for a public dummy EOA through the existing 5-RPS Trading API client. It accepts only a single matching v3 pool route, exact 1-test-USDC input, matching output/recipient and 0.5% minimum. Only HTTP 404 with [`UpstreamTimeoutError`](https://developers.uniswap.org/docs/trading/swapping-api/common-errors) retries the identical request, at most three attempts separated by 1 and 2 seconds. Other HTTP failures stop immediately. Output includes the attempt count and documented `errorCode` if present; malformed or unknown errors become `UNCLASSIFIED`. It prints no raw upstream response, permit, signature or calldata. A dummy account may have no funds, causing the API to report a transaction failure; that is an expected gate, not permission to bypass it. Both commands can be repeated without using a real wallet.

## Evidence and next gate

The owner ran `pnpm testnet:preflight` on 2026-10-01 at block `47530734`: all four standard-fee USDC/WETH pools were initialized, had positive active liquidity and returned a positive 1-USDC QuoterV2 result. The outputs varied by almost ninefold across fees, so this establishes contract identity and basic quotability, **not** a usable price or safe pool selection. The hosted `pnpm testnet:quote-probe` returned HTTP 404 with `UpstreamTimeoutError` on the next run. This identifies a transient upstream routing failure, not a proved viable API route. Re-run with the bounded retry diagnostic before changing routing, trade size or pool policy. No hosted quote, faucet balance or LP API support is confirmed. The agent sandbox's public DNS lookup for `sepolia.base.org` failed, so it cannot repeat these live observations here. The pure tests cover successful qualification, absent/unquotable pools, wrong chain, stale/reorganized blocks, missing code, token/pool mismatch, and quote route/amount failures. The owner can supply only the sanitized JSON output of the two commands; do not paste RPC credentials or API keys.

The owner subsequently reported `404 UpstreamTimeoutError` after **all three** attempts. Hosted routing remains unqualified. The [RPC demo decision](../superpowers/specs/2026-10-01-base-sepolia-rpc-demo.md) now selects a separate direct-v3 adapter for the testnet demo; the hosted probe is optional investigation, not a prerequisite for that adapter.

## Next check: direct RPC depth

With the same `BASE_SEPOLIA_RPC_URL` already configured, run from `vezta-dex/`:

```bash
pnpm testnet:depth
```

No API key or wallet is needed. This repeats contract/pool preflight, quotes 0.1/1/5 test USDC and 0.00001/0.0001/0.001 WETH for each eligible pool at the same block, then rechecks its hash. The amounts in JSON use raw token units. `priceImpactBps` compares the quote to that pool's marginal spot output after its fee, rounding up; 100 bps = 1%. `quoterGasEstimate` excludes full router/approval costs. These testnet quotes have no reliable dollar valuation.

`candidateFeeTiers` lists pools for which all six samples have valid positive outputs, compatible post-swap prices and impact ≤100 bps. `depthQualified:true` is **read-only depth evidence**, not a verified wallet flow. Samples with provider/revert failures report `QUOTE_UNAVAILABLE`; impossible/boundary values report `QUOTE_INVALID`. `withinImpactLimit:false` excludes a pool. No candidate produces exit 1; a reorg or wrong identity rejects the entire study. Send the sanitized JSON result. Do not repeatedly run the hosted probe while it returns the same timeout.

After live depth evidence, select one candidate and extend `/testnet` with wallet execution through the RPC adapter. It must verify account/chain, exact allowance, balance/gas, contract/calldata identity, quote expiration, simulation, explicit wallet submission and receipt recovery. NFT manager reads and create/increase/decrease/collect/close need separate on-chain tests with a testnet NFT. Faucet ETH and test USDC will be needed only for the later installed-wallet transaction check.

## Inspect live pools in the browser

The new `/testnet` page is a read-only stage of the testnet demo. Restart the development processes after setting `BASE_SEPOLIA_RPC_URL` in `apps/api/.env`; no Trading API/LP key or wallet balance is required.

```bash
pnpm dev
```

1. Open `http://127.0.0.1:3020/testnet`. It must show Base Sepolia, chain 84532 and test-token labels. Loading the page must not open MetaMask or automatically run a pool check.
2. Click **Check Base Sepolia pools**. Expect a loading message for up to 45 seconds, then block number/hash/time and each eligible pool's six quote samples.
3. A **Depth candidate** means all six fixed sizes passed the ≤1% impact policy. Click its **Preview … pool** button; check input, estimated output, 0.5%-slippage minimum preview and both token directions using **Quote sample**. Prices are testnet ratios with no reliable dollar value.
4. After two minutes, preview controls expire. Refresh must clear the old preview and re-read the pools. An unavailable RPC must show an error; no candidates is a separate successful study result. If no candidate passes, send the sanitized `pnpm testnet:depth` output before choosing a pool or altering trade sizes.
5. There must be no approval/sign/submit button or wallet prompt. This page provides discovery evidence; it does not establish successful public-testnet execution.

For an automated desktop check with deterministic mocked data:

```bash
playwright-cli -s=dex-testnet open http://127.0.0.1:3020/testnet
playwright-cli -s=dex-testnet run-code --filename=scripts/smoke-testnet-browser.js
playwright-cli -s=dex-testnet close
```

Expect `mockOnly:true` and seven passing checks, including integer output/minimum, reverse-direction decimals, no automatic selection, refresh-error invalidation and no wallet calls. Screenshot: `.playwright-cli/testnet-desktop.png`. This check validates the UI with fixtures; use the manual pool check or depth CLI separately for live evidence.

## Verification scope

Core/API/proxy/UI tests exercise malformed or stale reports, forged qualification flags, bounded errors, duplicate requests, deadlines, refresh failure and expiry. Final verification passed 514 Vitest tests, 82 Node script tests, typecheck, lint and build. Independent review identified a timeout-signal regression, which was reproduced and fixed with actual viem-source transport tests for both per-request and whole-study cancellation. The agent runtime denies binding localhost (`listen EPERM`), has no enabled browser transport, and denied native Chrome access; actual browser screenshots and live RPC pool-depth evidence must be checked on the owner's host. Mobile polish is deferred as requested. Testnet wallet swap, receipt reconciliation and NFT liquidity lifecycle are still incomplete.
