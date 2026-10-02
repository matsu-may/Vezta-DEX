# Base Sepolia LP demo

## Boundary and approved direction

Standalone Vezta DEX, Uniswap v3 USDC/WETH 0.3%, chain 84532. Continue the owner-authorized independent work: read positions, prepare liquidity operations, qualify on disposable Anvil, and provide `/demo/2`. Public LP execution remains disabled until its controller, transaction recovery and receipt binding are implemented. No new AMM, main Vezta integration, mainnet, mobile polish or owner signature.

## Read contract

Enumerate at most five owner NFTs per page from a fresh pinned block. Keep the same block across subsequent pages; expire the scan rather than merging different snapshots. Verify runtime hashes already rebuilt, manager/factory/pool configuration, token order/decimals and canonical block. Reject ownership drift, duplicate IDs and malformed state. Skip other token pairs/fee tiers and disclose partial scans.

Use pinned official SDK math for current principal at pool price. Show newly accrued fees since the position's last fee-growth checkpoint separately from stored tokens owed. Stored owed amounts can include withdrawn principal; never label the entire collectable amount as fees or profit. Zero liquidity is a closed range, not an earning position. No USD TVL/APR claims.

## Unsigned operations

Prepare mint, increase, decrease, collect and close against trusted pinned state, using the official SDK where applicable and independently decoding its calldata. Fixed 50 bps slippage; user input caps; ticks aligned to 60, bounded and ordered; owner is recipient; zero native value; manager is target and approval spender. Exact approval amounts only, reset nonzero mismatches first. Burn only zero liquidity and zero owed tokens. Collect never claims to remove liquidity. Preparation is not an execution authorization; no browser broadcast in this slice.

## Recording UI and verification

`/demo/2` follows the launchpad palette and desktop layout, links to `/demo/1`, and separates unavailable, empty, partial, stale and successful reads. No wallet prompt on page load or read request. Use explicit owner address input. Independently test tick boundaries, fee wraparound, principal/owed separation, wrong pool/owner/chain, stale/reorg pages, caps, minima and target binding. Run mock browser checks and a new Base Sepolia LP fork lifecycle once; do not repeat old swap or Polygon lifecycle evidence. Actual public testnet fees and owner signatures remain owner acceptance steps.
