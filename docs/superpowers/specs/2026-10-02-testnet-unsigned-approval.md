# Base Sepolia unsigned approval study

**Historical slice:** the [fee/preparation follow-up](2026-10-02-testnet-fees-swap-preparation.md) supersedes the L2-only budget and `totalFeeQualified:false` contract for funded studies. It preserves this exact/reset/ready policy and execution-disabled boundary. Owner unfunded acceptance is recorded in [current progress](../../research/2026-10-02-testnet-fees-swap-preparation-progress.md).

## Purpose and boundary

Continue the approved standalone testnet roadmap after the owner qualified both runtime-guarded quote directions at blocks 47556679 and 47556684. Produce one reviewed ERC20 approval/reset study, without signing, sending, a wallet button or enabling execution. The owner authorized routine choices; this slice uses native implementation with an independent final review.

## Contract

- Accept strict JSON `{intent, quoteId}`. Intent uses the existing Base Sepolia canonical USDC/WETH, six bounded input sizes and 50-bps policy. The opaque ID must bind the entire intent to an unexpired locally stored quote. Do not consume a quote for an approval study.
- Read a new block no earlier than the quote block. Require its timestamp within the existing 30-second freshness budget, valid nonzero hash, chain 84532, EOA wallet, token decimals 6/18 and both token code bodies present. Revalidate all five pinned Uniswap runtime hashes at that block.
- Read input/native balances, router allowance, mined/pending nonce at that block. Bounds are uint256 for balances/allowance and uint64 for nonces. Pending must equal mined. At completion confirm both quote/state canonical hashes, pending nonce and allowance; re-read quote binding/expiry. Fail closed on movement or stale results.
- Plan one action: exact allowance → `ready`; zero → exact approval; any other nonzero allowance → reset to zero. Reset must be confirmed and allowance reread in a future slice; never emit a reset-and-approve bundle.
- An unfunded wallet is a valid blocked study, with no transaction. Require input funding for an approval, but permit reset studies without input funds. Require positive native test ETH. Exact allowance needs no transaction or approval simulation.
- For a funded action, call and estimate the internally built zero-value transaction at the pinned block. Require canonical ABI bool `true` from approval simulation. Gas estimate must be positive, at least 21,000 and at most 200,000; use ceiling 120% gas limit, capped at 250,000. Current gas price must be positive and at most 1,000 gwei; use twice that price as an advisory legacy gas-price budget. Reject insufficient native balance for that L2 budget.
- Return the bound intent, quote ID, state provenance, approval kind, funding, simulation and advisory gas/unsigned transaction only after final checks. Keep `executionEnabled:false` and `totalFeeQualified:false`: Base has an additional L1 fee, and current gas price is not a pinned or guaranteed future price. Full fee policy and final transaction recheck remain future gates.
- Single-flight, 25-second abort budget; provider errors are bounded and secret-safe. POST `/api/v1/testnet/base-sepolia/approval` uses existing loopback server, 4-KiB JSON/no-query/no-store rules. No web proxy/UI is added.

## Verification and references

Tests must reject forged/stale/misbound IDs, changed code/block/nonce/allowance, false/reverted simulation, bad gas and insufficient funds; cover both tokens, exact/reset/ready and timeout recovery. Transport tests inspect actual JSON-RPC calldata/block parameters. A CLI reports bounded statuses without printing calldata/wallet/provider secrets; unfunded is a valid success, not execution evidence.

Installed viem 2.47.18 `call`/`estimateGas` implementations and types support `blockNumber`; verify their wire output. [Base network fees](https://docs.base.org/specifications/transactions/network-fees) documents L2 execution plus L1 security fees. No new dependency or deployment is required.
