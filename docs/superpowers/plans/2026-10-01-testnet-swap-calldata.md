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
- [ ] Run focused tests and full tests; commit the implementation.

## Task 2: Review and handoff

Files: this plan, the RPC demo spec, architecture/roadmap and testnet runbook.

- [ ] Record the owner-confirmed preview and selected demo pool, and document the separate router/spender and execution gates.
- [ ] Run typecheck, lint and build; preserve the existing next-env.d.ts edit.
- [ ] Dispatch one independent final review; fix material findings with RED→GREEN and a green full suite.
- [ ] Record verification and autonomous choices; preserve the branch and leave wallet writes disabled.
