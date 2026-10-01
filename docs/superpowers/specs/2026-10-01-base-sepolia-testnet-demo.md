# Base Sepolia testnet demo: qualification before wallet writes

## Decision

Develop a separate Base Sepolia (`84532`) Uniswap v3 candidate beside the existing Polygon code. The first slice is a read-only, pinned-block pool and quote preflight. It must not alter `/swap`, `/rehearsal`, or `/demo` or enable wallet submission. A verified 1-USDC quote proves only that a specific pool was quotable at one block. Hosted Trading API, LP API, funding, approvals, signing and receipts require separate evidence.

Official sources: [Uniswap Trading API supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains), [Uniswap v3 Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [Circle testnet USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Base Sepolia RPC](https://docs.base.org/cookbook/use-case-guides/finance/access-real-time-asset-data-pyth-price-feeds/).

## Data and verification boundary

Candidate tokens: Circle-issued **testnet** USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals) and WETH `0x4200000000000000000000000000000000000006` (18 decimals). Candidate contracts: v3 factory `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`, QuoterV2 `0xC5290058841028F1614F3A6F0F5816cAd0df5E27`, NFT position manager `0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2`. Do not infer a pool address from deployment alone: query `factory.getPool` for each standard fee tier at a pinned block. Read and validate token decimals/code, pool token order, fee, factory, initialized state and active liquidity; then request a 1-USDC QuoterV2 quote. Recheck the same block hash. Report only bounded public identity and readiness fields, never the RPC URL or upstream error text.

`readOnlyQualified` can become true only if all checks pass. It is not a wallet-write flag. A missing pool, zero liquidity, quote revert, stale block, wrong chain, changed hash or RPC failure fails closed. The API key and LP quota remain server-side concerns; no key is needed for this first on-chain probe.

## Threat model

| Scenario | Asset / trust assumption | Impact | Mitigation and verification | Owner |
|---|---|---|---|---|
| Polygon or malicious RPC is passed as Base Sepolia | Testnet token identity; RPC honesty | Wrong chain or token displayed | Check chain ID, block freshness/hash, token code/decimals, factory and pool identity | API adapter |
| Familiar USDC symbol points to another token | Testnet wallet funds; token registry | Wrong allowance or swap | Pin Circle address by chain ID; validate decimals on-chain; never use symbol as identity | Core registry |
| Pool exists but has no usable depth | Testnet wallet output | Reverted or very poor trade | Require initialized pool and positive 1-USDC QuoterV2 output; later inspect price impact and live Trading API route | Preflight, then swap adapter |
| Old quote or wrong router is signed | Testnet wallet balances | Bad signature or lost test assets | Keep write controls disabled until testnet-specific spender, route, calldata, expiry, simulation and receipt gates pass | Swap controller |
| LP data and actions use different chain/pool | Testnet NFT and tokens | Position cannot be managed correctly | Bind chain, manager, token order, fee, range, owner and receipt; qualify hosted LP actions separately | LP adapter |

## Follow-on slices

1. Owner runs the read-only preflight with a reachable Base Sepolia RPC. Record a pool, fee and small quote or the exact bounded failure stage.
2. Probe Trading API `CLASSIC` route/Permit2 and hosted LP API for that pair, without signing. Choose a pool only after both sources agree with pinned chain data.
3. Build a separate `/testnet` wallet route with explicit Base Sepolia network selection, exact approvals, signature review, simulation, one-shot submission and receipt recovery. Test rejection, expiry, wrong chain and uncertain submission.
4. Add testnet LP create/increase/decrease/collect/close only after each hosted payload is decoded, simulated and verified against the owner's NFT. Keep Polygon writes disabled.
5. Have the owner fund only a testnet EOA with faucet ETH and testnet USDC, perform capped transactions and return sanitized receipt evidence. Browser, CI and mobile checks close the standalone demo. Real-USDC Polygon decisions come later.

The agent environment currently fails DNS for `sepolia.base.org`, so live pool selection and wallet actions cannot be claimed from this workspace.
