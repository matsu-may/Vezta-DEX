# Testnet Fees and Swap Preparation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline TDD and a fresh final reviewer.

**Goal:** Complete snapshot fee estimates and add quote-bound unsigned swap preparation without enabling execution.

**Architecture:** Shared bounded fee policy, canonical pinned oracle reads in the existing paced RPC source, upgraded approval budget, separate swap reader, bounded API/CLI. Preserve original quote minimum/deadline and all live gates.

**Tech Stack:** Existing TypeScript/viem 2.47.18/Zod/Vitest; no new dependencies.

**Spec:** [Fees and swap preparation](../specs/2026-10-02-testnet-fees-swap-preparation.md).

## Global Constraints

- Chain 84532; fixed canonical USDC/WETH v3 fee 3000; 50 bps; original 30-second quote expiry.
- Gas ceiling 120%, price 2×, additional fees 2×; canonical Fjord/Jovian oracle only; no silent fallback.
- Approval gas estimate ≤200,000 /limit ≤250,000; swap ≤500,000 /limit ≤650,000; total budget <1 ETH.
- No signing/send/execution enablement; 25-second single-flight budgets; loopback 4-KiB strict JSON/no-store.
- Preserve owner next-env import/source evidence; no UI/main-Vezta changes.

## Review Focus

1. A successful zero operator fee differs from a failed/unsupported oracle read.
2. Serialization must use actual nonce/gas/price/destination/data, without rounding a uint64 nonce through Number.
3. An ETH balance sufficient for L2 but not total fees must never produce a transaction.
4. A fresh Quoter amount below the original reviewed minimum must not weaken protection.
5. An original quote can expire/reorg while fresh state/simulation/fees finish; no stale result may escape.

## Task 1: Complete fee policy and approval budget

**Files:** New `testnet-fees.ts`, `.test.ts`, `testnet-fees-probe.ts`, `.test.ts`, `testnet-fees-cli.ts`; modify `base-sepolia-source.ts`, `.test.ts`, `testnet-approval.ts`, `.test.ts` and test doubles/probe tests; root script.

**Interfaces:** Produce `planTestnetGas(estimate,price,kind)`, `serializeTestnetFeeEnvelope(transaction,nonce,gas,price)`, `completeTestnetFeeBudget(plan,additional)` and `TestnetFeeSource.getAdditionalFees(transaction,nonce,gas,price,block)`. Fee probe emits snapshot/model/budget metadata only. Existing approval request/result binding stays unchanged; funded gas gains total budget qualification.

- [x] Write/run failing pure/wire/approval tests for arithmetic, actual serialization fields, unsupported/error oracle and total-funding block. Expected missing helpers/methods and old L2-only result failures.
- [x] Implement pure policy and pinned oracle methods; upgrade funded approval budgets and add bounded no-funds fee probe.
- [x] Run `pnpm exec vitest run apps/api/src/testnet-fees.test.ts apps/api/src/testnet-fees-probe.test.ts apps/api/src/base-sepolia-source.test.ts apps/api/src/testnet-approval.test.ts apps/api/src/testnet-approval-probe.test.ts apps/api/src/testnet-routes.test.ts`; expected pass; commit scoped task.

## Task 2: Unsigned swap preparation

**Files:** New `testnet-swap-preparation.ts`, `.test.ts`, `testnet-prepare-probe.ts`, `.test.ts`, `testnet-prepare-cli.ts`; modify source/wire tests, routes/tests/main/root script and progress docs.

**Interfaces:** Consume Task 1 fee source/policy, existing quote store, runtime guard and core swap builder/inspector. Produce `TestnetSwapPreparer.read({intent,quoteId})`, source pinned simulation/estimate methods and bounded prepare CLI. Returned transaction retains original intent/minimum/deadline; execution stays disabled.

- [x] Write/run failing reader/wire/API/probe tests for both directions, funding/approval gates, original protections, malformed/reverted/mismatched simulation, total gas, canonical movement and late completion. Expected missing reader/source/API/probe failures.
- [x] Implement reader, source simulation/estimate, local API/main and CLI wiring.
- [x] Run focused new preparation/probe/routes/source tests; expected pass. Full `pnpm test`, typecheck/lint/build; expected pass. Attempt live fee/prepare probes and record reachability honestly.
- [x] Fresh final review against both tasks/spec/Review Focus; fix material findings with failing tests. Record owner approval acceptance and independent/public gates; commit scoped task excluding owner diff.

## Outcome

Implementation and local gates passed; fresh review found no material defect and one deferred regression-test suggestion. See [actual evidence and host checks](../../research/2026-10-02-testnet-fees-swap-preparation-progress.md). The two implementation tasks are complete; demo phase 2 and all public execution gates remain incomplete.
