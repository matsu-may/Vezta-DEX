# Polygon v3 LP position read and fork preflight

**Status:** Read-only code and local tests are present. A live Polygon fork and any LP wallet action remain unverified.

## Position reads

`GET /api/v1/lp/positions?chainId=137&owner=0x...&cursor=0&limit=5` enumerates at most five v3 Position Manager NFTs per request. It checks the actual NFT owner, filters to the fixed native-USDC/WETH 0.05% pool, reads the pool tick at the same Polygon block, and confirms that block's hash after the reads. It returns a `nextCursor` and `incomplete` flag because the wallet may own NFTs for other pools. An empty page does not prove that a wallet has no positions until all pages are read.

The response exposes NFT ID, ticks, in-range state and raw liquidity. `currentAmounts` and `uncollectedFees` are `null`: `positions(tokenId).tokensOwed*` alone does not include all fees accumulated since the last accounting update. No principal, USD TVL, APR or claimable earnings are inferred. Invalid requests return 400; stale/reorganized blocks or provider errors return a sanitized 503. No LP wallet controls or frontend position page were added.

## Disposable fork preflight

`node scripts/smoke-lp-fork-preflight.mjs` uses the ignored `POLYGON_RPC_URL` in `apps/api/.env`. It reads a fresh Polygon block, starts a disposable Anvil process bound to `127.0.0.1` at that exact block, checks chain ID, Anvil identity and source/fork block hash, then repeats the independent v3 pool checks on the fork. It prints only bounded status and booleans, never an RPC URL. It does not use an API key, fund an account, sign or send a transaction. Anvil is stopped when the probe ends.

The agent's network-restricted run returned `{"errorKind":"FORK_UNAVAILABLE","stage":"upstream"}`. Therefore no actual fork was verified in this environment and exact-approval/mint simulation remains open. The owner's unfunded Polygon wallet needs no assets to run this read-only preflight. Do not use the LP API's unlimited approvals.

## Decision record

- **Ruling:** Position pages scan at most five owner NFTs to bound per-request RPC work. If a wallet has more, callers follow `nextCursor`; this costs extra page requests.
- **Ruling:** A fork must match a fresh source block hash and independently verified pool before local transaction rehearsal. If the source is unreachable or stale, the fork gate stays open; this costs a later host run.
- **Ruling:** Do not expose LP write controls or fee/amount estimates from incomplete position data. This delays the LP UI but avoids displaying unsupported economics.
