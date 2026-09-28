# Permit2 Standard Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the owner's option 1 as a read-only, quote-bound Permit2 signing plan.

**Architecture:** Validate the canonical PermitSingle schema in the dependency-free core package. The API reads Permit2 allowance and nonce at a pinned Polygon block, checks the original stored quote again after RPC work, and returns only validated signing data or an existing-allowance status. It never signs or sends a transaction.

**Tech Stack:** Node 24, TypeScript, viem, Vitest, pnpm 10.33.2.

**Spec:** `docs/specs/2026-09-27-trading-api-swap.md` (option 1 approved on 2026-09-28).

## Global Constraints

- Polygon 137, curated native USDC/WETH, Universal Router 2.1.2, V4_NO_HOOKS.
- ERC20 approval and newly signed Permit2 amount exactly `amountIn`.
- Permit2 expiration at most 2,592,000 seconds ahead; signature deadline at most 1,800 seconds ahead; both must remain unexpired.
- Quote expires 30 seconds from request start. Signing data must come from that stored quote, without changing signed values.
- Credentials, raw quotes, signatures and RPC errors never appear in client errors or smoke output.
- Wallet writes, `/swap` calldata validation and receipt verification remain later gates. No write UI in this slice.

## Review Focus

1. Expiry while an RPC read is pending: reject the plan after the read.
2. A nonce advanced in another client: reject the old message.
3. A modified EIP-712 field/type/domain: reject rather than repair it.
4. `permitData: null`: inspect actual allowance, never infer authorization from null alone.
5. Existing unlimited permission or an on-chain permit transaction: block the unsupported path.

## Task 1: Canonical message policy

**Files:** Create `packages/core/src/permit2.ts` and adjacent tests; export via `index.ts`; reuse its Permit2 address in `apps/api/src/exact-approval.ts`. Update the spec and policy evidence.

**Interfaces:** Produce `POLYGON_PERMIT2`, `PERMIT2_POLICY`, `Permit2Data`, and `validatePermit2Data(data: unknown, intent: TradingIntent, nonce: bigint, now: number): Permit2Data`.

- [x] Write tests accepting original numeric/string uint values and exact schema; reject wrong domain/chain/contract/token/spender/amount/nonce, changed or extra types/fields, overflow, zero/expired timestamps and windows above the caps. Assert input and accepted output have identical values.
- [x] Run `pnpm exec vitest run packages/core/src/permit2.test.ts`; expect missing validator failures.
- [x] Implement strict object and ordered type checks, integer-safe bounds and timing limits. Reject execution-block expiration zero in this first standard timestamp path; do not rewrite it.
- [x] Run focused tests and `pnpm test`; expect all green.
- [x] Commit `feat(dex): validate standard Permit2 permission policy`.

## Task 2: Read-only quote-bound plan and host probe

**Files:** Modify quote store/tests, chain source, server/tests and main; create `apps/api/src/permit-reader.ts` and tests; add `scripts/smoke-permit-plan.mjs`; update roadmap and evidence.

**Interfaces:** Produce `QuoteStore.read(id, intent, routerVersion)` with the same binding/TTL as consume and `expiresAt: number`; preserve consume's single-use behavior. Produce `PermitChainSource.getPermitAllowance(token, owner, spender, blockNumber)` returning `{amount: bigint, expiration: bigint, nonce: bigint}` and `PermitReader.getPlan(intent, quoteId)` returning quote/block provenance and `permit.kind` (`sign`, `ready`, `blocked-existing`). Register `POST /api/v1/permit-plan` accepting the intent and opaque ID.

- [x] Write tests for independent quote copies, bound IDs, exact TTL, unconsumed reads, correct nonce, pinned block, stale/future block, RPC failure, expiry during RPC, consumed ID, malformed message, unsupported permitTransaction and null-permit existing allowance states. Route tests assert 400/405/503/no-store and absence of raw quote/RPC details.
- [x] Run focused tests; expect missing read/reader/endpoint failures.
- [x] Implement the reader using Task 1's validator. Require snapshot uint160/uint48 bounds. For null permit, return ready only for an exact allowance within the expiration cap; otherwise block. Validate the full stored quote and hook policy again after asynchronous reads. Share one QuoteStore between quote and permit readers in main.
- [x] Add a smoke probe that requests a quote and then a permit plan in both directions, prints only check booleans, kind, block and timestamps, and fails on unavailable or mismatched plans. Never print typed data or a nonce; never sign/send.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; expect all green. Host-network validation remains open if sandbox prevents it.
- [x] Obtain one fresh final DEX review; fix important findings with a failing regression first. Record actual results and commit `feat(dex): prepare quote-bound Permit2 signing plans`.

## Preflight / completion

All interfaces above connect directly: core policy → PermitReader → server/main; quote storage provides a read-only snapshot, while future swap preparation retains exclusive consume. Existing exact ERC20 approval is a separate prerequisite and must be rechecked before writes. PermitSingle signs spender permission, not tokenOut/minimum output/recipient; those remain application binding and calldata gates. Owner authorization permits inline execution without another plan-approval pause.
