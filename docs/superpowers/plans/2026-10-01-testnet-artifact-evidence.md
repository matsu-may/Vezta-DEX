# Testnet Artifact and Deployment Evidence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task under the owner's existing autonomous implementation authorization. Complete one independent review of the slice.

**Goal:** Verify installed official artifacts against the current direct-v3 encoder and collect bounded read-only Base Sepolia runtime evidence for later source/rebuild verification.

**Architecture:** Verification-only API tooling loads five pinned JSON artifacts. Pure checks enforce versions, fingerprints and ABI compatibility; the existing paced viem source supplies a stable-block snapshot. Runtime comparison remains evidence, with execution disabled until complete deployment and simulation gates qualify.

**Tech Stack:** Existing Node/TypeScript/viem/Vitest and the three owner-installed exact devDependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-testnet-swap-calldata.md`; Stage 1 of `2026-10-01-uniswap-dependency-and-adapter-strategy.md` governs provenance.

## Global constraints

- Standalone Base Sepolia 84532, existing pinned router/quoter/factory/pool/manager; wallet-owned signing remains future work.
- Package versions: swap-router-contracts 1.1.0 (router and QuoterV2), core 1.0.0, periphery 1.0.0 (NFT manager). Preserve router's transitive periphery 1.3.0.
- Verification artifacts stay out of API routes and browser/runtime imports. Preserve the owner's next-env diff.
- Fingerprints detect local drift; package/ABI compatibility does not prove independently compiled deployed source. Artifacts have no immutable-reference table: do not mask arbitrary bytecode differences.
- Snapshot: 25-second abort budget, original eight-second paced RPC timeout; fresh block ≤120 seconds and ≤5 seconds future; chain, nonzero block identity and final block hash must match.
- Save only public contract evidence to ignored `.local-evidence/base-sepolia-deployment.json`; no provider URLs, wallet data, signatures or private keys.

## Review focus

Artifact/package drift or misleading provenance flags; wrong router deadline tuple or Quoter parameter order; malformed/empty runtime or reorg/stale snapshots; timeout/cancellation and resource limits; saved evidence and error output leaking configuration or enabling execution.

### Task 1: Pinned artifact inventory and independent ABI/calldata check

**Files:** create `apps/api/src/testnet-artifacts.ts`, `testnet-artifacts.test.ts`, `testnet-artifacts-cli.ts`; update root scripts and include the owner-installed API devDependencies/lockfile.
**Interfaces:** `loadPinnedTestnetArtifacts()` returns five validated artifacts, role/address/runtime and fingerprints; `inspectTestnetArtifactInputs(inputs)` rejects changed version/bytes/identity; `assertTestnetArtifactAbi(routerAbi,quoterAbi)` checks exact selected functions; `reviewTestnetArtifactBundle(bundle)` returns bounded inventory and fixture-only bidirectional calldata compatibility, runtime/execution false.

- [x] Write failing tests using installed artifacts: valid inventory and two canonical encodings; wrong version/duplicate role/changed bytes; incompatible original-router deadline tuple and Quoter fee/amount order.
- [x] Run focused tests; expect missing implementation.
- [x] Implement manifest of observed artifact SHA256 values, bounded JSON reads (2 MB/file), selected ABI checks and real encoder comparison with artifact ABI using deterministic quotes/known deadline.
- [x] Add `pnpm testnet:artifacts`; run focused tests and offline CLI. Expect all checks pass, fixture-only and runtime/execution false.
- [x] Commit and complete with `pnpm test`.

### Task 2: Abortable stable-block deployment snapshot

**Files:** create `apps/api/src/testnet-deployment-snapshot.ts`, colocated tests and CLI; update root scripts, `.gitignore` and progress docs.
**Interfaces:** `TestnetDeploymentSnapshotReader(sourceFactory, clock?)` consumes Task 1 bundle plus source `getChainId/getLatestBlock/getCode/getBlockHash`, returns public snapshot and a bounded summary. Save uses only that snapshot; exact artifact runtime comparison never masks immutables or promotes execution.

- [x] Write failing tests: pinned role/address reads and exact/mismatch comparisons; missing/odd/oversized code, wrong chain/zero hash, stale/future/late block, reorg, source rejection with sanitized error, hung source cancelled at 25 seconds.
- [x] Run focused tests; expect missing implementation.
- [x] Implement reader with original study deadline and final freshness check; add strict `--save` CLI and ignored public evidence path. Add `pnpm testnet:deployment-snapshot`.
- [x] Run tests/typecheck/lint/build, restore owner next-env diff, run offline artifact CLI and one bounded read-only live snapshot attempt. Live network failure is recorded, not qualification.
- [x] Record actual inventory and remaining independent compile/immutable/source gates; commit and complete with `pnpm test`.
- [x] Independent whole-slice review; material fixes use one RED→GREEN pass, then required gates. Keep existing branch locally.

## Self-review

Both tasks produce verification evidence only. Task 2 consumes Task 1 validated runtime bytes and fixed roles; no source/artifact proof is synthesized from a mismatching runtime. Each review focus is covered by a task test or the explicit open independent-compilation gate. Owner package installation is authorized input; future host RPC evidence remains distinct from fixtures/local checks.
