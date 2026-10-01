# Testnet Source Evidence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline under the owner's standing autonomous authorization, with one fresh final review.

**Goal:** Acquire/cache validated single-contract compiler inputs and optionally bind them to saved deployment snapshots, without enabling execution.

**Architecture:** Pure source/snapshot validation consumes the pinned artifact manifest; a bounded public GET transport and atomic cache CLI supply evidence only. No application imports or new dependency.

**Tech Stack:** TypeScript, viem, Node fs/fetch and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-testnet-source-evidence.md`.

## Global Constraints

- Base Sepolia 84532; existing five artifact roles/addresses; default router; no arbitrary URL/role, bulk fetching, `.env`, signature or transaction.
- Sources: 200 files, 4,000,000 UTF-8 bytes, 512-character paths; runtime ≤65,536 bytes. Literal sources and independently checked metadata hashes only.
- Response: 8,000,000 bytes, 15-second cancellation/race budget, no retries; saved source ≤8 MB, snapshot ≤1 MB.
- Exact optional snapshot code binding; independentRebuildVerified/runtimeVerified/executionEnabled always false.
- Preserve owner next-env diff and current local branch; saved files ignored, temporary paths unique and atomic.

## Review Focus

Untrusted metadata/source settings accidentally becoming proof; forged/duplicate snapshot roles or hash flags; multibyte/chunked/late response limits; cache tampering or partial file publication; CLI options/diagnostics leaking configuration or selecting arbitrary network/filesystem targets.

### Task 1: Source graph and saved snapshot validation

**Files:** create `apps/api/src/testnet-source-evidence.ts`, colocated tests and a test-only complete fixture helper.
**Interfaces:** `prepareTestnetSourceEvidence(role,value,bundle,snapshot?)` returns normalized `payload`, prepared compiler `input` and bounded `summary`; consumes `loadPinnedTestnetArtifacts()`; validates optional snapshot internally from unknown JSON.

- [ ] Write tests with complete minimal Sourcify v2 fixtures: prepared input literal contents/settings, correct keccak hashes, outputSelection only replacement, false qualification; metadata/target/version/chain/address/graph mismatch, remote sources and byte bounds; complete optional snapshot roles/hash binding and mismatch.
- [ ] Run `pnpm exec vitest run apps/api/src/testnet-source-evidence.test.ts`; expect missing module RED.
- [ ] Implement strict allowlist normalization and pure validation; source strings are never executed/imported. Verify installed artifact identity for every snapshot role.
- [ ] Run focused tests, expect PASS; commit; complete with `pnpm test`.

### Task 2: Bounded fetch, cache and owner command

**Files:** create `testnet-source-fetch.ts`, `testnet-source-file.ts`, tests and `testnet-source-evidence-cli.ts`; modify root scripts/progress docs.
**Interfaces:** `fetchTestnetSourceEvidence(role,fetchFn=fetch)` returns unknown parsed JSON; `TestnetSourceEvidenceFile(directory,role)` reads bounded cached payload/snapshot and publishes one normalized payload atomically. CLI invokes Task 1 for new/cached payloads; only prepares compiler input, does not compile.

- [ ] Write tests for actual fixed single-contract GET and field selection, successful body at limit, oversize/missing/misleading length, hung/late body timeout, sanitized HTTP errors/no retry; real temporary-directory cache/atomic effects and invalid CLI options before network.
- [ ] Run focused tests, expect missing modules RED.
- [ ] Implement 15-second guarded stream reader and normalized cache owner; strict CLI `--role`/`--save` options, role router default, optional snapshot. Add `pnpm testnet:source-evidence`.
- [ ] Run full tests/typecheck/lint/build; expect PASS and preserve owner next-env. Run one bounded live acquisition attempt; network failure is not qualification.
- [ ] Record gate/evidence and concise host commands; commit and complete with `pnpm test`.
- [ ] One independent whole-slice review; one TDD fix pass for material findings, defer minors explicitly; keep local branch and clean only this plan scratch after durable records.

## Self-review

Task 2 accepts unknown JSON and feeds Task 1's validated payload; caching never bypasses pure validation. All five review focuses have owning tests. Source acquisition can run without a snapshot, but cannot claim any live runtime/rebuild qualification. Owner authorization persists; inaccessible services remain explicit external evidence gaps.
