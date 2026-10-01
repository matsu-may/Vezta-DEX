# Base Sepolia RPC pacing after confirmed HTTP 429

## Evidence and decision

Owner quote at block 47543583 passed forward. The reverse study failed during `getDependencyConfiguration` with HTTP 429; no reverse Quoter call started. The source fans out code, pool and dependency calls with no transport budget. This is a confirmed provider-rate failure, not evidence that wallet funding, pool choice or calldata is wrong.

Use a process-local scheduler shared by RPC origin, default **3 request starts/second**, at most **2 active requests**, queue at most **128**. `BASE_SEPOLIA_RPC_RPS` accepts integers 1–6. This is an independent RPC budget, not the hosted Trading API key's rate limit. Three starts/second reduces the observed burst while leaving the existing discovery study time budget usable; lower settings can cause a study to expire and must not relax freshness.

Queue wait is bounded to 25 seconds and abort-aware. Start the existing eight-second HTTP timeout only after scheduling, so queue wait does not consume network timeout. Preserve study abort propagation, original quote expiry and 25/45-second study deadlines. No automatic retry, cached configuration, adapter fallback or skipped reads. A failed study still fails closed.

The limiter is single-process; independent CLI/API processes or other applications can still consume the same provider quota. Origin-level sharing is conservative across credentials/paths. Cap the registry at 32 origins and reject changing rate configuration for an existing origin instead of resetting its budget.

### Task 1: Bounded abort-aware request scheduler

**Files:** `apps/api/src/testnet-rpc-pacer.ts` and colocated tests.
**Interfaces:** `run(task, signal?)` preserves result/error, controls start spacing/concurrency and queued cancellation; process registry returns one scheduler per origin.

1. Write failing tests for spacing, active concurrency, queued abort, queue timeout/cap, failure release and shared-origin configuration. Expected: missing module/behavior fails.
2. Implement scheduler and registry without retries or provider logging. Expected: focused tests pass.
3. Commit and complete with `pnpm test`. Expected: full suite green.

### Task 2: Pace the real viem source before HTTP timeout

**Files:** source and transport tests, `.env.example`, diagnostics/progress docs.
**Interfaces:** Transport uses Task 1 scheduler before the existing HTTP request; source factories share the origin budget. Study signals cancel queued work and actual fetches.

1. Write failing real-transport tests for cross-source pacing, queued abort and the eight-second network timeout after a queue wait. Expected: current unpaced source violates spacing.
2. Wrap HTTP transport, add bounded configuration and document owner evidence/ruling. Expected: transport tests pass, existing source/read tests stay green.
3. Run full test/typecheck/lint/build, preserve next-env owner diff, commit and complete. Expected: local gates pass; owner reverse quote remains pending until rerun.
4. Independent whole-fix review, then fix any material finding with RED→GREEN. Keep existing branch.

## Review focus

Queue/abort races, release on rejection, no deadlocks or duplicate requests, origin sharing across factories, strict RPS configuration, no timeout disabling, no stale quote acceptance, registry/queue resource bounds, secret-safe failures. Confirm discovery remains bounded with default pacing and no claim that local tests prove the owner's 429 resolved.
