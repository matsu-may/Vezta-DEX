# Testnet Swap Calldata Implementation Plan

> Execute inline with `superpowers:executing-plans`. The owner authorized routine choices toward the independent testnet demo.

**Goal:** Construct and inspect bounded unsigned direct-v3 swaps and exact/reset approval plans without wallet or RPC access.

**Architecture:** Pure shared-core policy with strict quote/intent validation; no runtime consumer until live router, quote and simulation gates pass.

**Tech stack:** TypeScript, viem ABI encoding, Zod validation and Vitest.

**Spec:** [Testnet calldata foundation](../specs/2026-10-01-testnet-swap-calldata.md).

**Interfaces:** Core exports a separate testnet policy, intent/quote types, `buildTestnetSwapTransaction`, `inspectTestnetSwapTransaction`, and `planTestnetTokenApproval`. No API/web signing consumer is added in this slice.

## Review focus

Cross-chain spender reuse, wrong direction/recipient, integer boundaries, zero minimum, altered input caps, stale/future timestamps, deadline extension, unchecked quote identity, alternate multicall selectors, multiple calls, trailing bytes, residual/unlimited approvals, and unsupported wallet aliases. Confirm no live execution readiness is claimed.

## Task 1: Policy, builder and inspection

Files: `packages/core/src/testnet-swap.ts`, `testnet-swap.test.ts`, `index.ts`.

- [x] Write failing tests for both directions and independently decoded ABI tuple/deadline, intent/evidence validation, envelope/calldata mutation and exact/reset approvals.
- [x] Observe RED, then implement the strict pure policy, canonical encoder/inspector and sequential approval plan.
- [x] Run focused tests and full tests; commit the implementation (`e56d2fe`).

## Task 2: Review and handoff

Files: this plan, the RPC demo spec, architecture/roadmap and testnet runbook.

- [x] Record the owner-confirmed preview and selected demo pool, and document the separate router/spender and execution gates.
- [x] Run typecheck, lint and build; preserve the existing next-env.d.ts edit.
- [x] Dispatch one independent final review; no material finding required a fix.
- [x] Record verification and autonomous choices; preserve the branch and leave wallet writes disabled.

## Verification and review

Observed RED before implementation; six focused tests and the full suite passed (522 Vitest, 85 Node). Typecheck, lint and build passed. Independent read-only review found no Critical or Important issue. Optional named mutation tests for `amountIn` and alternate multicall overloads are deferred; canonical calldata comparison already rejects them. This validates the pure foundation only. Source mapping is not deployed-bytecode proof; authentic pinned quotes, full consumption, live wallet state, reset receipt/reread, simulation, signing/recovery and receipt/LP checks remain mandatory before execution. The owner's existing next-env.d.ts change is preserved.
