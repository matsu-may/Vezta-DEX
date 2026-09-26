# Polygon WETH/USDC: pool and integration research

**Status:** provisional v3 candidate; milestone 0 remains open. **Observation:** Polygon block `94497119`, 2026-09-26 19:26:59 UTC (2026-09-27 02:26:59 ICT). Every on-chain value below was read at that block through a public Polygon RPC. No transaction was sent.

## Token and protocol identity

| Item | Polygon address | Evidence |
|---|---|---|
| Native USDC (6 decimals) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | [Circle's contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses); `decimals()` read at the observation block |
| WETH (18 decimals) | `0x7ceb23fd6bc0add59e62ac25578270cff1b9f619` | [Uniswap token provider](https://github.com/Uniswap/smart-order-router/blob/main/src/providers/token-provider.ts); `decimals()` read at the observation block |
| Uniswap v3 factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | [Official Polygon deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments) |
| Uniswap v3 QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` | [Official Polygon deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments) |

Polygon's bridged USDC.e (`0x2791bca1f2de4661ed88a30c99a7a9449aa84174`) is a different asset; do not merge its pools or balances with native USDC. [Circle's distinction](https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590).

## Direct v3 pool reads and quotes

`getPool(WETH, native USDC, fee)` returned these addresses. `liquidity()` is active in-range v3 liquidity in protocol units, **not USD TVL**; do not display it as TVL or use it alone to rank pools.

| Fee | Pool address | `liquidity()` | 100 USDC → WETH | 1,000 USDC → WETH | 10,000 USDC → WETH |
|---:|---|---:|---:|---:|---:|
| 0.01% | `0x80CdADE01Ff626B7CcE4772E3C2d56db14f384fA` | 600737885294 | 0.012974838916 | 0.015537981031 | 0.015824894388 |
| 0.05% | `0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9` | 40754944770195441 | **0.037220700433** | **0.372048451185** | **3.704314763368** |
| 0.3% | `0x19C5505638383337D2972Ce68B493aD78E315147` | 1810686269298949 | 0.037064525424 | 0.366922203494 | 3.291953375667 |
| 1% | `0x12bD7Ae45ACF2504BED144Eabc6FF5bBEbd91563` | 23498849621933 | 0.034068309881 | 0.262776017407 | 0.262779953411 |

Quotes are exact-input, single-pool `QuoterV2.quoteExactInputSingle` simulations, with USDC amounts `100000000`, `1000000000`, and `10000000000` base units and `sqrtPriceLimitX96 = 0`. The 0.05% pool returned the most WETH at all three sizes in this snapshot. Its effective prices were approximately 2,686.68, 2,687.82, and 2,699.55 USDC/WETH. Its output per USDC was 0.043% lower at 1,000 USDC and 0.477% lower at 10,000 USDC than at 100 USDC. Those are **relative quote changes**, not a certified price-impact metric: the 100-USDC baseline already includes fees and its own impact.

Reproduce a sample read (replace the block to get a current result):

```bash
cast call 0x1F98431c8aD98523631AE4a59f267346ea31F984 \
  'getPool(address,address,uint24)(address)' \
  0x7ceb23fd6bc0add59e62ac25578270cff1b9f619 \
  0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 500 \
  --block 94497119 --rpc-url "$POLYGON_RPC_URL"
cast call 0x61fFE014bA17989E743c5F6cB21bF9697530B21e \
  'quoteExactInputSingle((address,address,uint256,uint24,uint160))(uint256,uint160,uint32,uint256)' \
  '(0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359,0x7ceb23fd6bc0add59e62ac25578270cff1b9f619,100000000,500,0)' \
  --block 94497119 --rpc-url "$POLYGON_RPC_URL"
```

The quote response includes a QuoterV2 gas estimate for its simulated pool path. It is **not** a complete wallet/router transaction gas estimate. A quote at an old block is not executable at that price now.

## Integration evidence and remaining gates

- [Uniswap Trading API](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains) lists Polygon (`chainId 137`), but an authenticated Trading API quote and its routing/approval/transaction payload have not been checked. Its best route may differ from the single-pool v3 results above.
- [Uniswap LP API](https://developers.uniswap.org/docs/liquidity/liquidity-provisioning-api/integration-guide) documents v3/v4 create, increase, decrease, fee claim, approval checking, and pool-info endpoints. It requires a server-side API key. No Polygon-specific unsigned LP response has been verified, so these actions are not yet approved for implementation against this pool.
- Broad `/explore` and `/pools` discovery needs an indexed source. [Uniswap's subgraph overview](https://developers.uniswap.org/docs/ecosystem/subgraphs/overview) says public deployments are not maintained by Uniswap Labs; verify Polygon v3/v4 coverage, schema, authentication, lag, and outage behavior before choosing one. A factory read confirms only pools queried explicitly.
- v4 pools, route aggregation, reverse WETH→USDC quotes, live transaction gas, position ownership/fees, and representative target-user trade sizes remain unmeasured. Recheck quotes near implementation time and record the source block/timestamp.

**Working decision:** use the native-USDC/WETH Uniswap v3 0.05% pool as the first *read-only demonstration candidate*. It is not a production allowlist or proof of safe LP returns. Keep swap and LP writes disabled until authenticated API responses, gas/impact limits, data freshness, and position flows pass milestone 0.
