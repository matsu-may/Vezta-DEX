# Base Sepolia demo through Uniswap v3 RPC

## Decision and evidence

The owner observed four initialized, quotable Circle test-USDC/WETH pools at block 47530734. The hosted Trading API repeatedly returned `404 UpstreamTimeoutError`, including all three bounded retry attempts. This does not prove the pair is unsupported, but hosted routing cannot currently qualify the demo. Use a separate direct Uniswap v3 RPC adapter for Base Sepolia; retain the API probe as an optional diagnostic. This decision follows the owner's authorization to choose routine implementation options toward a standalone testnet demo.

First deliver a read-only depth study. Keep testnet writes gated until its live evidence, contract mapping, transaction simulation and receipt checks pass. Testnet pool prices have no reliable dollar value; do not compare them to mainnet prices or report APR/TVL.

## Depth study contract

Reuse the existing canonical token/factory/QuoterV2 verification and one pinned block, exposing its hash. Read each eligible pool's identity and `sqrtPriceX96` again at that block. Probe exact-input USDC amounts `100000`, `1000000`, `5000000` and WETH amounts `10000000000000`, `100000000000000`, `1000000000000000` in raw units. Calls run sequentially. QuoterV2 runs only via `eth_call`, never as a transaction.

For token0 → token1, the fee-adjusted marginal output is `floor(amountIn * (1000000-fee) * sqrtPriceX96² / (1000000 * 2^192))`; invert the price ratio for token1 → token0. Price impact is the nonnegative difference between this output and the quote, divided by marginal output, rounded up in basis points. Use bigint throughout. Reject zero output/gas, impossible price movement, output above the marginal bound, and the Quoter's extreme default price limits where input may be only partly consumed. Quoter gas is diagnostic, not a full wallet transaction estimate.

A sample is within the demo depth policy only at ≤100 bps price impact. A pool is a depth candidate only when all six samples are valid and pass. Return all sample outcomes and candidate fee tiers; do not automatically select a pool because it gives the largest testnet WETH amount. Recheck the original block hash after all calls. Wrong identity or a changed block fails the entire study; quote revert/provider error fails the sample with a bounded code and no raw details. This result grants no write permission.

## Trust boundaries and next gates

| Scenario | Asset / assumption | Impact | Mitigation and verification | Owner |
|---|---|---|---|---|
| Quote and pool price come from different blocks | RPC consistency | Incorrect impact estimate | Pin every read and quote; recheck block hash; test reorg | API adapter |
| Fee or token order is applied incorrectly | Integer amount identity | Misleading quote comparison | Verify pool order/fee; test both reciprocal directions and rounding | Depth study |
| Quote reaches an extreme price limit | Full input consumption | Partial swap mistaken for exact input | Reject boundary sqrt prices; later verify balance deltas | Quote and receipt adapters |
| Direct calldata targets a wrong spender/recipient | Test wallet tokens | Unexpected transfer | Pin official contract; decode exact approval and swap; simulate; explicit wallet submit | Future swap controller |
| Hosted API recovers while RPC is selected | Adapter identity | Mixed quote/permit/calldata | Explicit source per route; never mix adapter payloads | Web/API |

After live depth evidence, choose one candidate pool for the demo and implement a bounded direct-v3 quote/transaction flow, exact approvals, EOA and gas checks, deadline/slippage checks, explicit signing, recovery and economic receipt verification. Qualify NFT manager reads and mint/increase/decrease/collect/burn separately. The owner will later use faucet ETH and Circle test USDC; agent tests and local forks do not establish a successful public-testnet wallet transaction.

The owner has now confirmed live API/web depth and matching previews in both directions. Fee 3000 is the bounded candidate. The [calldata foundation](2026-10-01-testnet-swap-calldata.md) implements strict pure encoding/inspection and sequential exact/reset approvals, without any API/web execution consumer. Its execution quote expires after 30 seconds; the existing 120-second discovery preview must never be reused as executable quote evidence. Remaining deployment, wallet-state, quote authenticity, simulation and receipt gates still apply.

Sources: [Base Sepolia v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [IQuoterV2](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/IQuoterV2.sol), [QuoterV2 implementation](https://github.com/Uniswap/v3-periphery/blob/main/contracts/lens/QuoterV2.sol), [TickMath](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol), [API errors](https://developers.uniswap.org/docs/trading/swapping-api/common-errors).
