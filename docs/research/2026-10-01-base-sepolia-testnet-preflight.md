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

Only after these probes pass should a separate `/testnet` wallet route be built and exercised. It must verify account/chain, exact allowance, balance/gas, API route and router address, quote expiration, simulation, explicit wallet submission and receipt recovery. Hosted LP create/increase/decrease/collect payloads and an owner-controlled NFT require separate tests. The existing Polygon `/swap` and `/rehearsal` remain unchanged and gated.
