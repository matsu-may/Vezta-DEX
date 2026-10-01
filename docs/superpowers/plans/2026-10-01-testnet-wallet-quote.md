# Testnet wallet-bound quote implementation

Spec: `docs/superpowers/specs/2026-10-01-testnet-wallet-quote.md`.

## Global constraints

Standalone testnet, no signing/broadcast, no main Vezta changes, no UI changes, no claim of deployed runtime verification. Preserve the owner's next-env diff. Continue on the existing feature branch. Owner has authorized these technical choices.

### Task 1: Trusted pinned quote reader and bounded store

**Files:** core testnet intent parser; API `testnet-swap-quote.ts`, `testnet-quote-store.ts`, source extension and colocated tests.

**Interfaces:** Source extends BaseSepoliaDepthSource with dependency configuration and tick spacing reads. Reader produces `{quote, quoteId, priceImpactBps, qualification}`. Store consumes strict quotes and normalized intents; pure core transaction builder validates freshness and minimum.

1. Write failing service/store/transport tests covering the spec's input classes; run focused Vitest. Expected: missing new exports/modules or behavior fails.
2. Implement parser, pinned checks, bounded reader/store and source getters. Expected: focused tests pass, no write RPC method.
3. Commit scoped source and tests; run task completion suite `pnpm test`. Expected: all pass.

### Task 2: Local HTTP routing, host probe and runbook

**Files:** API testnet routes/main/CLI/tests, root package scripts and progress docs.

**Interfaces:** Handler consumes Task 1 reader; main forwards Content-Type and chooses the same tested dispatcher for both depth and quote routes. Host CLI consumes the same real source/reader with DEX_SMOKE_WALLET.

1. Write failing request/routing/CLI validation tests. Expected: handlers absent or invalid behavior fails.
2. Add bounded JSON-only quote endpoint, shared dispatcher, CLI and command/runbook. Expected: focused tests pass; CLI rejects invalid input before RPC, prints only bounded diagnostics.
3. Run full tests, typecheck, lint and build; preserve next-env diff. Expected: all pass. Attempt live read only if reachable; note unavailable network without relaxing gates.
4. Commit and mark task complete; independently review the whole slice. Fix material findings with RED→GREEN and full suite. Record actual phase 2 progress and remaining deployment/state/simulation gates.

### Task 3: Stable wallet-state reads without transaction exposure

**Files:** API state reader/source/handler/CLI, tests and progress docs.

**Interfaces:** Extends the same trusted source with pinned token/native balance, allowance and nonce methods. The shared strict intent parser drives state HTTP input. Outputs separate valid unfunded state from unavailable data; approval kind is advisory, not executable calldata.

1. Write failing source/reader/HTTP tests for pinned reads, unfunded EOA, exact/reset/ready kinds, uint bounds, nonce movement, reorg, stale/late work and timeout. Expected: absent modules/methods or behavior fails.
2. Implement pinned state source and bounded reader, extend dispatcher, add host CLI. Expected: focused tests pass and no signing/write RPC.
3. Run full tests/typecheck/lint/build and independent whole-slice review; update consolidated progress and owner checks. Expected: all local gates pass; unavailable live evidence remains explicitly pending.
4. Commit scoped changes and complete with `pnpm test`.

## Review focus

Inspect original timestamp expiry, no cross-wallet/direction/chain quote reuse, async timeout cleanup/late-result suppression, strict RPC quote math and limit exhaustion, source getter ABI/address/block pinning, public error/log redaction and lack of signing/broadcast. Configuration checks must not be labeled runtime verification. API request dispatch must actually use the tested routes.
