# Base Sepolia RPC Depth Implementation Plan

> **For agentic workers:** Execute inline with `superpowers:executing-plans`. The owner has authorized routine implementation choices for the standalone testnet demo.

**Goal:** Measure both directions and several small trade sizes without a wallet or hosted API.

**Architecture:** Extend the existing RPC source with generic QuoterV2 calls. A pure reader reuses preflight and returns pinned-block, integer price-impact evidence. A CLI loads only the RPC configuration and prints bounded summaries.

**Tech Stack:** TypeScript, viem, Vitest, pnpm.

**Spec:** [RPC demo design](../specs/2026-10-01-base-sepolia-rpc-demo.md).

## Constraints and review focus

- Chain 84532; canonical Circle test USDC and WETH; standard v3 fees only.
- Read-only calls; no private key, signature, approval or broadcast path.
- Six fixed samples, bigint math, ≤100 bps candidate threshold; no dollar-value inference.
- Wrong-chain/identity and reorg reject the entire result; per-sample failure stays bounded.
- Catch reciprocal-price errors, upward rounding at the threshold, extreme-price partial fills and cross-block reads.

## Task 1: Depth reader and RPC boundary

**Files:** Modify `base-sepolia-preflight.ts`, `base-sepolia-preflight.test.ts`, `base-sepolia-source.ts` under `apps/api/src/`; create `base-sepolia-depth.ts` and its tests beside them.

**Interfaces:** Preflight exposes `blockHash`. `BaseSepoliaDepthSource` extends preflight with `quoteExactInput(tokenIn, tokenOut, amountIn, feeTier, blockNumber)`, returning amountOut, sqrtPriceX96After, initializedTicksCrossed and gasEstimate. `probeBaseSepoliaDepth(source, nowMs?)` reports all six samples per eligible pool and candidate fees.

- [x] Write failing tests for pinned-block reads, 100-bps boundary, reciprocal prices, ceil rounding, quote failures, unexpected price direction, extreme limits and final reorg.
- [x] Run the targeted tests and confirm the missing behavior fails.
- [x] Implement the reader, expose block hash, and add the generic source call using the official QuoterV2 tuple ABI.
- [x] Verify targeted tests, including encoded RPC call arguments and returned tuple fields.

## Task 2: CLI and evidence handoff

**Files:** Create `apps/api/src/base-sepolia-depth-cli.ts`; modify root `package.json`, the Base Sepolia runbook and `docs/roadmap.md`.

- [x] Add `pnpm testnet:depth`; bounded result/failure output and nonzero exit when no pool passes.
- [x] Record persistent hosted timeout and explain how direct RPC depth evidence progresses the demo.
- [x] Run full tests, typecheck, lint and build; preserve the existing web-generated-file edit.
- [x] Commit only this slice and report live evidence still needed from the reachable host.

## Verification and remaining evidence

Implementation commit: `d58d742`. Full verification passed: 499 Vitest tests, 82 Node script tests, typecheck, lint and build. The existing React detection and Next.js workspace-root warnings remain. A separate reviewer found no actionable issues and independently reran all 12 focused tests and the whitespace check. The local live command returned `RPC_UNAVAILABLE`; no live depth candidate or successful testnet wallet transaction is claimed. Owner action: run `pnpm testnet:depth` using the already configured reachable Base Sepolia RPC and provide its sanitized result. Pool selection and wallet/LP gates follow that evidence.
