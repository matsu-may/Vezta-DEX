# Base Sepolia unsigned approval progress

**Follow-up accepted:** the owner subsequently passed both unfunded approval studies at 47564799 /47564808. The old host handoff below is complete. Full snapshot fees and unsigned swap preparation follow in the [latest progress/checks](2026-10-02-testnet-fees-swap-preparation-progress.md); the L2-only limitations below describe this historical slice, not the updated funded implementation.

## Owner runtime acceptance

Both owner host quote directions passed the fresh runtime guard on chain 84532 /v3 fee 3000:

| Direction | Block /UTC observed | Input → output /minimum |
|---|---|---|
| USDC→WETH | 47556679 /2026-10-01 19:07:26 | 1000000 → 5983064180459989 /5953148859557689 |
| WETH→USDC | 47556684 /2026-10-01 19:07:36 | 100000000000000 → 16607 /16523 |

All intent/minimum/freshness/opaque-ID/configuration/runtime checks were true; `executionEnabled:false` remained correct. These were unexpired when observed; the old quote IDs are not reusable now.

## Implemented and chosen

The approved next slice adds POST `/api/v1/testnet/base-sepolia/approval` and `pnpm testnet:approval`. The shared quote store binds the full intent/ID. A separate fresh block verifies EOA, token decimals/code, all five runtime pins, input/native balances, allowance and mined/pending nonce. Both original quote and new state hashes, pending nonce, allowance and quote expiry are checked before returning anything.

- Exact allowance needs no approval. Zero produces only an exact approval; every other nonzero allowance produces only a zero reset. A reset receipt and fresh allowance reread are still required before exact approval in the future wallet flow.
- An unfunded wallet returns a valid **blocked study with no transaction**, rather than an RPC failure. Reset does not require input tokens but still needs native ETH.
- Funded action studies simulate canonical ERC20 bool `true` and estimate gas at the pinned block. Gas is bounded and buffered to ceiling 120%; current gas price is doubled for an advisory L2 budget. Insufficient L2 budget blocks returning a transaction.
- Keep `executionEnabled:false` and `totalFeeQualified:false`. The latter deliberately leaves the additional Base L1 fee unqualified; simulation success is not receipt success. [Base fee documentation](https://docs.base.org/specifications/transactions/network-fees) explains the two fee components.
- No web/UI integration, signer, send method, deployed contract, new dependency or source-cache modification is introduced. The owner's desktop/mobile/main-Vezta boundaries are preserved.

## Verification and review

Initial focused run: 13 missing-feature failures /14 existing passes. Three intermediate failures were checksum-casing assumptions in tests; corrected expectations to the existing canonical address behavior. Focused tests then passed; review added two existing-contract characterization tests for independent quote/state reorgs and native funding on reset.

The independent reviewer found no concrete code/security bug and identified those two P3 test gaps, now covered. It declined live RPC compatibility, original artifact provenance, full Base fees and execution readiness. Those remain separate evidence classes; previously accepted runtime rebuilds/host quotes do not prove this new funded approval path.

Actual live attempt with the owner's public address failed at `getChainId`, diagnostic `kind:transport`, before quoting or studying an approval. This is the agent environment's reachability limit, not evidence that the owner's provider is faulty. No transaction was sent or wallet prompt opened.

Final local gates: `pnpm test` passed 76 Vitest files /676 tests plus 85 Node script tests; `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Four focused files passed 29 tests. The two added reorg hash constants initially needed Hex type annotations; the corrected typecheck passed. A new unused test-parameter warning was removed; remaining warnings are the preexisting React detection and Next workspace/multiple-lockfile notices. Logs are `/private/tmp/vezta-dex-approval-{red,focused,full}.log` locally, not committed. Remote CI and browser acceptance were not run; no UI behavior changed.

SHA-256 comparisons preserved all ten raw/normalized source-evidence files and the historical deployment snapshot. The owner's existing `apps/web/next-env.d.ts` dev-route import was restored after the build and excluded from the commit.

## One host check

From `vezta-dex`, run:

```bash
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e pnpm testnet:approval
```

No dev server, real USDC or wallet signing is required. With the previously unfunded wallet, expect two rows with `status:testnet-approval-study`, `studyStatus:blocked`, `runtimeVerified:true`, `quoteIdMatches:true`, `transactionPresent:false`, `executionEnabled:false`, `totalFeeQualified:false`. The reason should identify missing input/native funding. `simulationSucceeded:false` and `gasEstimated:false` are expected when the funding checks block simulation.

An unavailable/error row is a failed read, not a valid funding block; share its bounded code/diagnostics. Do not change runtime pins, remove funding checks or fund a real-money wallet merely to make this check pass. A funded test wallet can instead yield `unsigned-prepared`; that is still diagnostic-only and does not qualify total fees or authorize submission.

## Remaining stages

**Phase 2 remains incomplete:** total Base fee policy, funded approval qualification, reset receipt/reread, swap simulation/recheck, unsigned swap preparation and receipt/recovery consumers remain open. After those gates are qualified, continue independent coding/mock/fork work for phases 3–6 under the owner's standing authorization; public-testnet wallet signatures and receipts require owner operation. Do not mark phase completion based solely on mocks or this approval study.

Next implementation order: full fee budget and unsigned swap simulation → intent-bound receipt/reset/recovery APIs → wallet controller and deterministic/fork scenarios → testnet LP adapter/lifecycle → integrated desktop demo and acceptance runbook. Keep mobile polish and main Vezta integration deferred.
