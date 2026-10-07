# Uniswap-style frontend polish — 2026-10-07

Desktop UI captures use deterministic **mock data and mock wallets**. They do not prove public-chain execution or current balances. All browser `/api/**` requests were intercepted; no real signing, RPC or broadcast was performed.

## Changes
- Unchanged original Circle USDC and Uniswap WETH assets; original Base/Unichain network images. Sources and hashes live beside the assets in `apps/web/public/{tokens,networks}/README.md`.
- Vezta black/gray surfaces and lime controls, with compact Uniswap-style spacing.
- Search supported tokens by name, symbol or address in a modal. Token identity stays scoped to the curated chain registry.
- Transaction review modals retain exact input, output minimum, recipient/spender, transaction target and complete fee budget. Explicit submit and controller checks remain authoritative.
- LP review preserves maximum authorization, planned/minimum deposit, range and NFT identity.
- Recovery cards retain the original context/hash. Closing review does not submit. Acknowledge/reject does not reopen an empty review.

## Browser coverage
Header hover and keyboard menus; wallet chooser; quote; review close/reopen; token search/reversal; Explore tabs; pool detail; full/custom LP ranges; position detail; chain switching; desktop overflow at 1280/1920; LP approval review → mocked submit → verified receipt → acknowledge. No browser runtime errors were observed.

## Owner check
From the original `vezta-dex` checkout, run `pnpm dev:testnet` and open `/networks/base-sepolia/swap`.
1. Check original token icons and top-right MetaMask chooser.
2. Search/select USDC or WETH; verify changing token invalidates the old quote.
3. Open/close/reopen review and check minimum, target/spender and fee budget. Closing must not prompt MetaMask.
4. Browse Explore → Pools → detail, then Pool → Create position with full/custom range. Check LP caps/minimums in review.
5. Optionally perform a small testnet operation and verify original-hash recovery/acknowledgement.

Mobile acceptance, new tokens/auction functions and mainnet enablement remain separate work. Existing unavailable-data labels remain; no TVL/APR/chart data was fabricated.
