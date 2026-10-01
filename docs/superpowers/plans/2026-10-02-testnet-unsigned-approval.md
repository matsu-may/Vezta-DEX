# Testnet Unsigned Approval Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with TDD and one fresh final reviewer.

**Goal:** Return a quote-bound, canonical-block unsigned exact/reset approval study while testnet execution stays disabled.

**Architecture:** Add a separate approval reader using the existing quote store, runtime guard, planner and paced RPC source. Extend the existing local API and provide a read-only diagnostic CLI; keep all browser execution and swap simulation for later slices.

**Tech Stack:** Existing TypeScript, viem 2.47.18, Zod, Vitest; no dependency additions.

**Spec:** [Unsigned approval study](../specs/2026-10-02-testnet-unsigned-approval.md).

## Global Constraints

- Chain 84532; existing canonical tokens, six inputs, 50 bps and 30-second quotes.
- Exact/reset/ready only; one action; no signatures, sends or execution enablement.
- Single-flight/25-second abort; 4-KiB strict JSON; no provider payloads in logs.
- 120% gas limit capped at 250,000; 2× current gas price; L1 fee unqualified.
- Preserve owner `apps/web/next-env.d.ts` change and all local evidence; no UI changes.

## Review Focus

1. Nonzero smaller/larger allowances always require zero reset; never allow a bundle.
2. A reset can be studied without input tokens, but still needs native ETH.
3. A late provider result cannot publish after timeout, and the reader must recover.
4. A quote can expire or reorg during state/simulation; no transaction may escape.
5. L2 budget coverage must never imply full Base fee sufficiency or execution readiness.

## Task 1: Reader, transport, API and bounded CLI

**Files:** Create `apps/api/src/testnet-approval.ts`, `.test.ts`, `testnet-approval-probe.ts`, `.test.ts`, `testnet-approval-cli.ts`; modify `base-sepolia-source.ts`, `.test.ts`, `testnet-routes.ts`, `.test.ts`, `main.ts`, root `package.json`; update progress docs.

**Interfaces:** Consume `TestnetQuoteStore.read`, `verifyTestnetRuntimeCodes` and `planTestnetTokenApproval`. Produce `parseTestnetApprovalRequest(value)` and `TestnetApprovalReader.read(value)` for strict `{intent,quoteId}`; source adds `simulateApproval(transaction,block):Promise<Hex>`, `estimateApprovalGas(transaction,block):Promise<bigint>`, `getGasPrice():Promise<bigint>`. Probe consumes a shared quote/approval reader pair and emits one bounded row per direction.

- [x] Write failing tests for the specification and five Review Focus conditions. Use real planner/store/runtime guard; replace only external RPC with precise doubles.
- [x] Run the focused command; 13 missing-feature failures /14 existing passes observed before implementation.
- [x] Implement reader validation, pinned RPC simulation/gas, API wiring and CLI; funded paths return an unsigned study, unfunded paths return blocked with no transaction.
- [x] Focused 29 tests and full 676 Vitest /85 script tests passed; typecheck/lint/build passed. Actual read-only CLI failed at transport/chain read, recorded separately from funding blocks.
- [x] Fresh reviewer found no code bug; added its two P3 coverage cases against the existing correct contract. [Actual decisions, gates and next host check](../../research/2026-10-02-testnet-unsigned-approval-progress.md).
- [x] Commit only this slice, excluding owner changes; remaining diff is the owner next-env import.
