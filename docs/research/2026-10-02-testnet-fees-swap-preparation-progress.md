# Testnet fee budgets and unsigned swap preparation

## Owner approval acceptance

The owner's unfunded approval studies passed both directions on Base Sepolia:

| Direction | Block /UTC observed | Accepted result |
|---|---|---|
| USDC→WETH | 47564799 /2026-10-01 23:38:06 | Input/native funding absent; blocked, no transaction |
| WETH→USDC | 47564808 /2026-10-01 23:38:24 | Input/native funding absent; blocked, no transaction |

Both had `runtimeVerified:true`, `quoteIdMatches:true`, `executionEnabled:false`. Simulation/gas/total-fee flags were false because funding blocked those reads. This accepts the unfunded path, not funded simulation or receipts. Do not rerun the old approval handoff solely for acceptance.

## Implemented

- Shared integer fee policy: gas rounded up to 120%, gas price doubled, additional fee estimates doubled; bounded gas/price/components and total below 1 ETH. Insufficient total ETH never returns an unsigned transaction.
- Direct, pinned reads of the canonical Base GasPriceOracle: code, Fjord/Jovian flags, `getL1FeeUpperBound` using the actual unsigned transaction byte length, and `getOperatorFee` using buffered gas. A successful zero operator fee is valid; a failed/unsupported read is not zero.
- Existing exact/reset approval studies now use complete snapshot budgets on funded branches.
- POST `/api/v1/testnet/base-sepolia/prepare` binds the existing opaque quote ID/full intent to fresh EOA, tokens, five runtime pins, balances, exact allowance and nonce reads. No transaction is returned for unfunded or approval-required studies.
- Funded exact-allowance studies validate fresh pool/configuration/Quoter impact and simulate the original deadline-wrapped swap. Only one canonical returned uint256 is accepted; it must match Quoter and meet the originally reviewed minimum. Final quote/state hashes, allowance, pending nonce and original expiry are rechecked.
- Added bounded, read-only `testnet:fees` and `testnet:prepare` diagnostics. Execution remains disabled; there is no browser signer or send method in this slice.

## Decisions and limits

1. Use pinned official oracle methods rather than installed viem OP Stack fee helpers, whose latest-block reads and silent operator-fee zero fallback conflict with strict qualification. Unsupported deployments block. Cost if wrong: an otherwise usable provider/model may remain unavailable until explicitly supported.
2. Keep legacy encoding and existing gas/quote protections; no dependency upgrade, fork of Uniswap or custom contract. Cost if wrong: a future wallet envelope/model needs its own fee qualification before execution.
3. Treat the complete fee budget as a buffered **snapshot estimate**, not a future fee guarantee or fee-oracle audit. Canonical system-predeploy code/flags are a chain trust assumption; the five independently rebuilt Uniswap runtimes do not prove the oracle implementation. Cost if wrong: fees may change before signing; final preparation/recheck remains mandatory.
4. Keep separate approval/swap readers rather than refactor the accepted approval state machine now; share core intent/calldata, runtime/store and fee policies. Cost if wrong: common state guards must remain aligned as future adapters evolve.
5. Continue locally on the existing authorized branch and preserve the owner's `next-env.d.ts` change and evidence caches. No UI, main Vezta integration, signing, push or deployment is part of this slice.

## Verification

Task 1 RED: seven missing-policy/source or old-budget failures; focused GREEN: 34 tests. Full gate: 681 Vitest +85 script tests, typecheck/lint/build passed. Commit `88a50d3`.

Task 2 RED: 15 missing-reader/source/API/probe failures; focused GREEN: 32 tests. Full gate: 696 Vitest +85 script tests and typecheck passed. A wire-test casing assumption was corrected to viem's actual checksum-preserving encoding; payload/block checks remain intact. Final lint/build and diff check passed; a new unused-variable warning was removed. Remaining notices are the preexisting React detection and Next workspace/lockfile warnings. The existing owner dev-route import was restored after build and excluded from commits; SHA-256 comparisons preserved all 11 source/snapshot evidence files. Code commit `4a10d62`.

The final task-completion run repeated the full suite after the last test cleanup: 80 Vitest files /696 tests plus 85 script tests passed. Review did not require code fixes. The plan's two implementation tasks are complete; the broader demo phases retain their stated open gates.

Both live probes in the agent environment failed at `getChainId` with diagnostic `kind:transport`, before reading fees or preparing a swap. This does not establish a fault in the owner's RPC. No transaction was sent. Local doubles/bytecode fixtures do not establish funded public-testnet compatibility. Remote CI/browser/public receipt gates remain unobserved.

## Independent review and deferred item

Fresh read-only review covered `5ef8b63..4a10d62`, including all five stated review focus areas. It found no Critical/Important defects and accepted the diagnostic scope. One Minor is deferred: add expiry regression advancing time during final asynchronous hash/nonce/allowance reads when extending the lifecycle; the implemented final `fresh()` guard is present and correct.

Reviewer boundaries and rulings: public RPC/model access requires host probes; funded execution/charged fees require fork/public evidence; independent oracle proof remains the explicit system-predeploy trust assumption; post-response/signing freshness needs final submission recheck; receipt/replacement/recovery/consume work remains gated off. Browser/mobile/main Vezta changes are outside this slice. Earlier runtime rebuilds/features retain their own evidence/reviews, with new guard consumption and the full regression suite checked here. The owner `next-env.d.ts` modification stays untouched by commits. Costs if these assumptions fail: provider/model rejection, unqualified funded compatibility/actual fees, incorrect oracle estimates, expired future submissions, incomplete recovery/replay protection, or unqualified later UI/integration. None permits enabling execution now.

The final review deliberately covers this plan's two commits rather than repeat earlier branch reviews; cost if wrong is reliance on existing historical reviews plus the full regression suite for broader integration. This follows the owner's standing authorization to keep the branch local; no merge/push decision is needed in this unfinished demo.

## Two host checks — no funded wallet needed

From `vezta-dex`, with the existing `apps/api/.env`, run these **sequentially**, not in parallel. No dev server is needed.

```bash
pnpm testnet:fees
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e pnpm testnet:prepare
```

1. Fee check: expect `status:testnet-fee-model-read-only`, `chainId:84532`, `referenceOnly:true`, `model:jovian`, positive L1 estimate/budget, and `executionEnabled:false`. A successfully read zero operator fee is permitted. The reference gas limit is not an estimate for a real wallet action; this only qualifies oracle/model access. If this result is unavailable, stop and share its bounded code/diagnostics before progressing; do not guess a model or weaken the gate.
2. Prepare check: for the still-unfunded wallet, expect two `testnet-swap-preparation-study` rows, `studyStatus:blocked`, `reason:TESTNET_INPUT_BALANCE_LOW`, `runtimeVerified:true`, `quoteIdMatches:true`, `transactionPresent:false`, `executionEnabled:false`. False simulation/gas/total-fee flags are expected because these branches skip funded work. This is a successful blocked study, unlike an `unavailable` row.

Share the sanitized JSON rows. Do not buy real USDC, paste RPC keys or sign a transaction for these checks. If the quote expires during preparation, share the code/timings; do not extend the deadline or weaken freshness to force a pass.

## Six-phase position

| Phase | Current state /remaining work |
|---|---|
| 1. Discovery | Live reads/bidirectional previews accepted; desktop expiry/refresh/error/no-prompt browser acceptance remains |
| 2. Preparation | Runtime proof, owner unfunded approval acceptance, full fee policy and unsigned swap code exist; host new-path checks, funded fork/live simulations, final one-time submission recheck and reset receipt/reread remain |
| 3. Wallet swaps | Testnet controller, bound receipt/event/balance accounting, pending/replacement/reorg/reload recovery, fork/browser and owner-operated public-testnet swaps remain |
| 4. LP | Base Sepolia SDK math/owner NFT reads and mint→increase→decrease→collect→close adapters/lifecycle qualification remain; Polygon fork evidence does not replace these |
| 5. Desktop assembly | Integrate the testnet adapters using token-launchpad desktop styling; complete access/readiness/budget/chain-isolation tests and acceptance |
| 6. Handoff | Integrated runbook/matrix, actual evidence and owner testnet/desktop acceptance remain |

**Phase 2 is not complete.** After host oracle/new-path checks, the next implementation slice is final intent-bound recheck/receipt/reset/recovery contracts plus disposable-fork qualification, followed by controller and LP work. Independent code/mock/fork work remains authorized. Only owner-operated public-testnet signatures/receipts and genuine product choices require owner action. Mobile and main Vezta integration remain later work.

[Spec](../superpowers/specs/2026-10-02-testnet-fees-swap-preparation.md) · [Plan](../superpowers/plans/2026-10-02-testnet-fees-swap-preparation.md) · [Complete roadmap](../superpowers/plans/2026-10-01-standalone-testnet-completion.md).
