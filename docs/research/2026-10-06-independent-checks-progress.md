# Independent checks before one owner acceptance pass

Base: `08d405c`; branch `codex/testnet-product-completion`; original checkout
and recovery untouched. No push, deploy, public signing, new dependency or UI
behavior change in this session. The owner will check all product deltas once.

## Custom-range LP fork

The owned-Anvil wallet harness now accepts `--custom-range`, preserving the
no-argument full-range path. Mint retains the explicit range through bounded
reset/approval rounds; increase refers to the created NFT without injecting a
new range. Actual NFT ticks are checked after mint/increase/partial decrease/
full decrease/collect; restarted mint receipt recovery must retain the original
range. The test fixture centers a finite spacing-60 range on the observed pool
tick; it is not an app-selected investment strategy.

New focused tests: seven passed after meaningful RED tests caught the old
harness ignoring the range and invoking study for malformed ticks. The first
live fork passed reset/exact approvals, then timed out in mint gas estimation;
owned Anvil was stopped. A single bounded retry prefetched the range boundary
read data to reduce cold fork misses. It also timed out at
`estimateTestnetSwapGas` during mint after the exact approvals passed. Retry
block **47761904**, observed tick **221828**, fixture ticks **221220–222480**.
The snapshot cleanup path ran and owned Anvil stopped. Neither run reached a
mint receipt: custom-range fork lifecycle evidence remains **unqualified**.
No simulation deadline or application gate was relaxed. A later fork pass can
use `pnpm testnet:lp-wallet-fork --custom-range`; it is not an owner acceptance
prerequisite and is not a request to repeat diagnostics now.

## Fee evidence

`pnpm testnet:receipt-fees <hash>` is a bounded read-only diagnostic. It requires
actual RPC chain and exact transaction/receipt/block identities. Quantities are
canonical JSON-RPC integers, overflow rejected. Missing L1/operator fields stay
null; DA footprint fields are not money. Even complete observed component fields
are not independently qualified fee-model evidence or an inferred wallet debit.
The existing UI/receipt `actualTotalFeeQualified:false` remains unchanged.

Read-only public probe of the owner-provided swap:
`0x3b18344ea7c5d685615a2605d132bc005b16ce54f79d2c8dd3319ce730b2a465`.
Canonical block **47660523**, hash
`0xb3e683d7427906d70c19901518cb3f359f1ffdbf194c8de733540578e67d2f7c`;
observed `2026-10-06T13:08:17.481Z`. RPC reports successful receipt;
L2 gas cost **2889876481646 wei**, L1 fee **37800030439 wei**, operator fee
**absent**. Total remains unknown. Transaction sender is the observed outer
sender; it is not automatically the reviewed wallet's fee debit.

Fee component meanings were checked against the
[OP Stack fee guide](https://docs.optimism.io/op-stack/transactions/fees) and
[Jovian execution specification](https://specs.optimism.io/protocol/jovian/exec-engine.html).

## Phase 8 preparation

Shared read-only transport is now consumed by Base source and the diagnostic
CLI: response bounds, aborts, pacing and explicit method allowlist retained.
Both Base and Unichain metadata are locally tested. No second-chain transaction
adapter, wallet chain selector, runtime pins or execution support was activated.
The concrete adapter/recovery migration design is in
`../superpowers/specs/2026-10-06-second-chain-adapter-boundary.md`.
Owner choice between Unichain Sepolia (recommended) and Ethereum Sepolia is pending.

## Review and verification

One fresh review identified two bypasses in the new read-only transport: viem's
exposed transport request retained an unguarded path, and mutable queued input
could change a validated read into a write. Both regression tests failed before
the fix. The same guard now protects both request paths, and method/params are
snapshotted before pacing. **33 focused tests and workspace typecheck passed**
after the fix. No real write was used to reproduce either issue.
Final checkpoint: **152 Vitest files; 1,105 passed/one skipped; 85 Node script
tests passed**. `pnpm typecheck`, `pnpm lint` and `pnpm build` passed. Lint retains
only the existing React autodetection warning. This session did not change UI,
so the earlier browser evidence remains historical and no new browser pass is
claimed. The custom-range fork failure above remains a separate missing proof.

## Owner handoff

Use the single [product delta guide](2026-10-05-testnet-product-owner-guide.md).
No requirement to repeat independent compiler/fork/fee diagnostics. Public custom
range, new pool receipts, activity and UI deltas remain owner acceptance items.
The latest branch commit replaces the previous 08d405c startup checkpoint; verify
`git log -1` against the final report after a fast-forward merge when no recovery
is active. Complete charged fees and phase 8 activation are not marked complete.
