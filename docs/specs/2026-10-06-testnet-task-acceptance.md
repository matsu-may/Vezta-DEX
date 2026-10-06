# Standalone DEX task acceptance on testnet

## Owner intent

The owner clarified on 2026-10-06 that the deliverable is the completed DEX task
using public testnets. The early demo is a historical checkpoint. Keep the
standalone `vezta-dex` repository and launchpad-style desktop UI; integrate into
the main Vezta project later. Continue independent work and consolidate owner
wallet acceptance into one final guide.

## Functional exit criteria

| Requirement | Required evidence |
|---|---|
| Browse pools | Explore, pool list/detail, filtering and explicit chain/pool identity; fresh source/block metadata and clear unavailable/stale states |
| Same-chain spot swap | User-selected supported amount/slippage, fresh quote, exact approvals, reviewed simulation, wallet submission and original receipt reconciliation in both directions |
| Earn/manage liquidity | Position discovery, full/custom-range mint, increase, partial/full decrease, collect and close; NFT ownership/range and actual token movements verified |
| Multi-chain scalability | At least two public testnets with independently qualified read, swap and LP adapters; explicit network selection; no cross-chain quote, allowance, context or recovery reuse |
| Wallet reliability | Supported direct/delegated wallet envelopes, reject/change/expiry handling, reload and original-hash recovery; no automatic resend |
| Accounting | Clear principal/owed/fees distinction; estimated budgets separated from observed costs; missing charged fee components never reported as zero or a complete total |
| Delivery | Independent review, passing CI/local quality gates, configuration/runbook and one consolidated public-testnet acceptance report |

Initial assets/protocol remain curated USDC/WETH and deployed Uniswap v3 CLMM.
The existing size, impact and slippage limits stay explicit. AMM/CLMM/DLMM
mechanisms belong in the knowledge documentation; this scope does not require
implementing a new AMM, a DLMM protocol or custom Solidity contracts.

## Remaining work at checkpoint 13d8ed1

1. Resolve the custom-range local-fork mint gas-estimation timeout and obtain
   successful range/NFT/lifecycle/restart evidence. Unit/browser coverage and
   historical full-range acceptance do not replace that proof.
2. Complete the fee-evidence investigation and specify any provider/model limits.
   Partial receipt fields cannot qualify a complete charged total or wallet debit,
   especially for relayed transactions. Preserve the current unknown labels.
3. Finish phase 8: select the second testnet, verify dependencies and fee/finality
   policy, implement chain adapters and chain-qualified stores/UI/recovery, then
   independently test swaps and the LP lifecycle. Unichain Sepolia is the recorded
   recommendation; its selection/activation remains pending.
4. Reconcile the final supported feature/chain matrix and desktop UX, run one
   complete release checkpoint, and update the single owner guide. Keep the old
   Base contexts compatible and the original owner checkout intact.
5. Owner performs the final faucet-funded public-testnet wallet acceptance on
   supported chains. Fix any failures before recording task completion.

## Completion rule

Implementation checkboxes are not public acceptance. A read-only second chain
does not satisfy executable multi-chain support. Mock/local fork evidence does
not replace public wallet receipts. Record each gate as implemented, independently
verified, owner accepted, or unresolved, with its evidence and limits.

Mainnet funding, cross-chain bridging, main Vezta integration, mobile polish and
public backend hosting retain their separately deferred scope. Testnet completion
does not imply production/mainnet readiness. Existing `/demo/*` URLs may remain
compatible entry points; the route name does not determine the completion standard.
