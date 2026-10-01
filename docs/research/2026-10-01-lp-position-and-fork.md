# Polygon v3 LP position read and fork preflight

**Status:** The owner verified the read-only Polygon fork preflight at block `94738219` and the separate disposable-fork mint rehearsal at block `94738685`. No real Polygon wallet action was performed.

## Position reads

`GET /api/v1/lp/positions?chainId=137&owner=0x...&cursor=0&limit=5` enumerates at most five v3 Position Manager NFTs per request. It checks the actual NFT owner, filters to the fixed native-USDC/WETH 0.05% pool, reads the pool tick at the same Polygon block when a position needs classification, and confirms that block's hash after the reads. An owner with zero NFTs no longer needs a pool-tick RPC. The endpoint returns a `nextCursor` and `incomplete` flag because the wallet may own NFTs for other pools. An empty page does not prove that a wallet has no positions until all pages are read.

The response exposes NFT ID, ticks, in-range state and raw liquidity. `currentAmounts` and `uncollectedFees` are `null`: `positions(tokenId).tokensOwed*` alone does not include all fees accumulated since the last accounting update. No principal, USD TVL, APR or claimable earnings are inferred. Invalid requests return 400; stale/reorganized blocks or provider errors return a sanitized 503. No LP wallet controls were added.

The standalone frontend now has a read-only `/positions` page. It accepts a public EVM owner address, requests at most five owner NFTs per page, verifies the response is bound to Polygon, that owner, the pinned v3 manager and pool, and preserves `nextCursor` even when a page contains only unrelated NFTs. It shows NFT ID, tick range, in-range state, raw liquidity and block freshness. Amounts and fees stay explicitly unavailable. The view uses the token launchpad's compact dark table cues and has empty/loading/error states; no wallet signature or LP action is exposed. Automated component and API validation pass. Browser-level visual inspection is still pending because the agent's local Chrome session could not launch in the restricted environment.

The owner's first empty-wallet check showed “Data unavailable.” The frontend had expected a raw position page while the server correctly returned `{ page: ... }`; the client now parses that envelope, with a regression test using the actual response shape. Empty-wallet reads also skip the unnecessary pool-tick request. If the view still reports unavailable after the updated processes reload, inspect the direct `/api/v1/lp/positions` HTTP status: 503 means RPC/read failure, while a 200 response should render an empty owner state.

After restarting the local development processes, the owner entered an address without positions and confirmed the page displayed “No positions owned.” This is end-to-end evidence for the empty state only; pages with matching NFTs, mobile layout and LP write controls remain unverified.

## Disposable fork preflight

`node scripts/smoke-lp-fork-preflight.mjs` uses the ignored `POLYGON_RPC_URL` in `apps/api/.env`. It reads a fresh Polygon block, starts a disposable Anvil process bound to `127.0.0.1` at that exact block, checks chain ID, Anvil identity and source/fork block hash, then repeats the independent v3 pool checks on the fork. It prints only bounded status and booleans, never an RPC URL. It does not use an API key, fund an account, sign or send a transaction. Anvil is stopped when the probe ends.

The owner's host returned `verified:true` for all six checks at block `94738219`. The agent's restricted network previously returned `{"errorKind":"FORK_UNAVAILABLE","stage":"upstream"}`. The owner's unfunded Polygon wallet needs no assets to run this read-only preflight. Do not use the LP API's unlimited approvals.

## Disposable fork mint rehearsal

`node scripts/smoke-lp-fork-mint.mjs` reruns the source/fork/pool preflight, then requests one unsigned `/lp/create` payload for 1 native USDC in the fixed v3 0.05% pool. It decodes the direct mint, requires the fixed pair, full-range ticks, owner recipient, bounded minima, deadline and a local-only 0.001 WETH cap. It ignores the API's unlimited `/lp/check_approval` transactions. All writes target a freshly spawned `127.0.0.1` Anvil process with automatic impersonation; no private key or real wallet is used.

On that disposable fork only, the script funds the test EOA with POL and transfers USDC/WETH from the pool's forked balances. Those transfers perturb pool reserves, so the result checks calldata, allowance, mint execution, NFT ownership and balance accounting—not real market economics. It sends exact ERC20 approvals, confirms the allowances, simulates and estimates gas for the mint, then checks the local receipt, NFT and token deltas. It prints bounded booleans and stops Anvil in every exit path. An API key and working Polygon RPC are needed on the host; neither is printed.

The owner's run at block `94738685` returned `verified:true` for source/fork identity, pool verification, exact local approvals, successful simulation with bounded gas, successful mint receipt, simulated/minted NFT ID match, owner/pool/liquidity match, bounded token spend, exact balance deltas and residual allowance. This qualifies the **local-fork create rehearsal only**. It does not qualify live-wallet LP writes, real market economics or `/lp/increase`, `/lp/decrease` and `/lp/claim_fees` payloads. The fork NFT disappears when Anvil stops; the hosted LP API cannot read that local token ID as an actual Polygon position.

## Disposable fork lifecycle rehearsal

`node scripts/smoke-lp-fork-lifecycle.mjs` extends the same verified fork mint with **direct v3 Position Manager calls**: reset residual mint allowances, approve a second exact local cap, increase, partially and fully decrease, collect owed tokens, burn the empty NFT, then clear both residual allowances. It previews each increase/decrease output and puts a 50 bps minimum in the local calldata. The review checks owner and liquidity at each step, owed amounts after each decrease, no wallet transfer before collection, exact collection balance deltas, residual allowances, zero final allowances and the burn event. It prints bounded status only and exits with a failure code if any check fails.

The owner ran this on a disposable Anvil fork from Polygon block `94746016`. Fork identity and pool checks, mint, exact reapprovals, bounded increase spend, partial/full decrease, owed-token accrual, collection balance deltas, successful receipts, zero final allowances and NFT burn all returned `true`; the script exited after `fork-lifecycle-local-only` reported `verified:true`.

This is an Anvil contract-wiring check, not hosted Uniswap LP API validation or a live economic result. The fixture again moves forked pool balances. No real wallet, funding, key or signature was needed. Later hosted `increase`, `decrease` and `claim_fees` checks still require a Polygon NFT actually controlled by the owner.

## Decision record

- **Ruling:** Position pages scan at most five owner NFTs to bound per-request RPC work. If a wallet has more, callers follow `nextCursor`; this costs extra page requests.
- **Ruling:** A fork must match a fresh source block hash and independently verified pool before local transaction rehearsal. If the source is unreachable or stale, the fork gate stays open; this costs a later host run.
- **Ruling:** The fork fixture uses only exact approvals derived from validated mint ceilings. Residual allowance must equal approved minus simulated spend; cleanup and real wallet policy still need a separate review.
- **Ruling:** Do not expose LP write controls or fee/amount estimates from incomplete position data. This delays the LP UI but avoids displaying unsupported economics.
