# Second executable testnet: feasibility and owner choice

Date: 2026-10-05. Phase 8 research only. No new chain, wallet switch, funds,
registry pin or execution adapter was activated.

## Read-only findings

Both candidates have official Uniswap v3 deployments and Circle test USDC.
Bounded live reads verified token decimals, pool factory/token identities,
fee 3000, spacing 60 and initialized active liquidity. All six demo sizes
(0.1/1/5 USDC and 0.00001/0.0001/0.001 WETH) returned quotes within 1% impact.
This is historical depth evidence; it does not qualify runtime or execution.

| Candidate | Ethereum Sepolia | Unichain Sepolia |
|---|---|---|
| Chain ID | 11155111 | 1301 |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `0x31d0220469e10c4E71834a79b1f276d740d3768F` |
| WETH | `0xfff9976782d46cc05630d1f6ebab18b2324d6b14` | `0x4200000000000000000000000000000000000006` |
| 0.3% pool | `0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50` | `0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e` |
| Observed block | 11845901 | 64313144 |
| Observed at (UTC) | 2026-10-05 01:59:24 | 2026-10-05 01:59:32 |
| Maximum sampled impact | 1 bp | 14 bps |
| Main implementation difference | L1 fee/finality adapter | Another OP Stack chain; validate its own fee/finality rules |

Block hashes: Ethereum
`0x4dba97ce085fcfed3b338d9e29644e8ccf0c6159b11bedfc9b24b99e6bae219d`;
Unichain
`0x9f923d9723d96720e144d790a170ebfbed45123b9fffb62caed41a7026d02d5c`.
The canonical Ethereum Sepolia RPC returned non-JSON in this session;
PublicNode worked. One working endpoint is not a reliability guarantee.

## Recommendation and alternatives

**Recommend Unichain Sepolia** for the next standalone demo chain: OP Stack
experience from Base reduces adapter work, and the measured pool serves the demo
sizes. This is an engineering inference, not permission to reuse Base runtime
pins or fee/finality assumptions unchanged. Ethereum Sepolia is useful if the
owner prefers testing a distinct L1 model; it requires a different fee adapter.
Deferring either chain allows the Base release to close first, but does not meet
the second executable-chain milestone.

Owner choice is required before activation because it changes wallet setup,
faucet funding and the supported demo network. Test ETH availability/eligibility
must be checked by the owner; no mainnet funds are required for the intended demo.

## Work after selection

1. Resolve exact deployments and independently rebuild router/quoter/factory/
   pool/manager runtimes, bind every constructor/immutable and token identity.
2. Qualify RPC stability, fee oracle/receipt fields, confirmations/finality and
   envelope/delegation support for that chain.
3. Add chain-keyed configuration and the adapter; bind quote, store, review,
   calldata, history and recovery to chain identity. No cross-chain swap.
4. Run focused unit tests and one guarded local fork lifecycle, then desktop
   wallet/recovery mocks; only afterward request owner faucet/public acceptance.

## Primary sources

[Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses),
[Ethereum v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments),
[Unichain v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-unichain-deployments),
[Unichain network information](https://developers.uniswap.org/docs/unichain/technical-information/network-information),
[Ethereum networks](https://ethereum.org/developers/docs/networks/),
[Circle faucet](https://faucet.circle.com/),
[Unichain faucet guidance](https://developers.uniswap.org/docs/unichain/tools/faucets).
Faucet limits and eligibility can change; verify when funding the chosen wallet.
