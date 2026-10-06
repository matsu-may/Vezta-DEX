# Final independent testnet checks

> Use superpowers:executing-plans inline. Owner defers public wallet acceptance until one final pass.

**Goal:** close the missing custom-range fork evidence and improve bounded fee evidence while preparing the second-chain boundary.
**Architecture:** preserve every Base public wallet/UI default and existing recovery context. Extend the owned-Anvil LP wallet harness with opt-in custom range; reuse bounded paced read-only transport for a receipt evidence CLI. No chain activation before the pending owner choice.
**Tech stack:** existing TypeScript, viem, Vitest, Anvil; no new dependencies.
**Spec:** approved 2026-10-04 product roadmap phases 3, 5, 6, 8 and 2026-10-05 progress ledger.

## Constraints

Work only on the existing isolated product branch. Do not merge/push/deploy/restart owner servers or use public wallet funds. Keep executionEnabled false in all diagnostic results. Missing receipt fee fields are unknown, not zero. Fee component arithmetic is not independent qualification or a wallet debit. Preserve full-range harness invocation without arguments.

## Tasks

### Task 1: Custom-range real LP wallet fork

Files: testnet-lp-wallet-fork-steps(.test).ts; testnet-lp-wallet-fork-lifecycle.ts; testnet-lp-wallet-fork-cli.ts; new testnet-lp-fork-range(.test).ts.
Interface: optional range only in mint intent; increase uses created NFT range. --custom-range derives a bounded spacing-60 range around the pinned pool tick, solely for a funded local fixture.
- [x] RED: custom range retained through resets/approvals, not injected into increase; malformed range rejected before study; CLI invalid arguments rejected.
- [x] GREEN: preserve default path, propagate explicit custom range, assert NFT ticks after mint/increase/decrease/collect and restart recovery of minted original receipt.
- [ ] Verify focused tests and one owned-Anvil lifecycle. Record actual NFT/range/spends, snapshot revert and child shutdown.

Focused tests passed. Two bounded live attempts reached exact approvals but
timed out during mint gas estimation; owned Anvil stopped and cleanup ran.
Successful custom-range lifecycle evidence remains unqualified; no more retries
in this session. Details are in the dated progress report.

### Task 2: Shared read client and fee receipt evidence

Files: new testnet-read-client(.test).ts; base-sepolia-source.ts; new testnet-receipt-fee-evidence(.test).ts and CLI; package script.
Interface: bounded, abortable, origin-paced read transport with explicit read-method allowlist; raw receipt collector emits only validated known fee components and missing-field names.
- [x] RED: read methods work across chain metadata; writes rejected before fetch; stalled/oversized response guarded. Receipt missing/invalid/overflow quantities, explicit zero vs absent operator, deposit/DA fields, chain/block mismatch covered.
- [x] GREEN: reuse transport in Base source without changing protocol qualification; canonical receipt/block/transaction probe, never total-fee or execution qualification.
- [x] Verify tests and one read-only historical public hash probe. Keep actualTotalFeeQualified false and document missing proof.

### Task 3: Handoff and chain boundary

- [x] Document chain-qualified deployment/config/runtime, fee/finality, wallet envelope and recovery interfaces using actual Base module inventory. Preserve chain-choice gate.
- [x] Update progress and one final owner guide, with no requirement to rerun independent diagnostics.
- [x] One final full suite, typecheck/lint/build; one fresh whole-change review and one RED/GREEN fix pass if needed; local commit only.

Final gates: 152 Vitest files / 1,105 passed / one skipped; 85 Node tests passed.
Typecheck, lint and build passed. Review's two Important findings were reproduced
with failing regressions and fixed in one pass. Task 1's live lifecycle proof
remains pending; this checkpoint does not mark the entire plan achieved.

## Review focus

Range altered after approval; custom ticks lost in restart recovery; collector labels observed fields complete actual fees; missing operator treated as zero; shared transport permits writes or loses response/abort/rate bounds; second-chain preparation mistaken for supported execution.
