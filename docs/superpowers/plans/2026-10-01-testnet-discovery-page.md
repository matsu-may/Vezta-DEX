# Testnet Discovery Page Implementation Plan

> Execute inline with `superpowers:executing-plans`. Routine choices are authorized by the owner.

**Goal:** Open `/testnet` without a funded wallet and inspect live, validated Base Sepolia pool-depth snapshots.

**Spec:** [RPC demo design](../specs/2026-10-01-base-sepolia-rpc-demo.md), with the discovery boundary below.

## Discovery boundary and review focus

Only canonical test USDC/WETH and the six fixed samples are exposed. Share a strict response contract in core: chain/source/block provenance, standard unique fees and addresses, exact sample identities, integer amounts, consistent impact and candidate flags. A valid study with no candidates is an empty qualification result, not a provider failure. Invalid, stale or oversized responses fail closed.

API: fixed GET `/api/v1/testnet/base-sepolia/depth`, no query parameters, no-store; RPC configuration only, no Trading API key. Deduplicate concurrent reads, cap the complete study at 45 seconds and abort RPC work at expiry. Web: fixed same-origin GET `/api/testnet-depth` proxies only the configured loopback API, rejects redirects, bounds JSON and validates the shared contract. No remote URL or wallet address input.

UI: manual fetch only, no wallet methods; clear the previous result during refresh/failure. Show all pool outcomes and quote samples with token decimals, impact, block/hash/time, testnet labels, and explicit no-dollar-value wording. Candidate status is a depth screen, not transaction readiness. Expire snapshot selection after 120 seconds; refresh rechecks it. No automatic pool selection or signing/submission controls. Reuse the launchpad black canvas, #111 cards, lime actions, square corners and monospace numbers. Mobile polish remains deferred by the owner.

**Review focus:** forged candidate/impact flags, mismatched sample sizes or chain, zero/overflow values, stale timestamps, duplicate pool identities, configured URL injection, accidental wallet/broadcast calls, repeated fetches, abort/single-flight behavior, and stale results surviving refresh failures.

## Task 1: Shared contract and read API

Files: core `testnet-depth.ts` and tests; API `testnet-discovery.ts` and tests; modify depth/source/main.

- [x] Write and observe failing boundary, failure, concurrency and deadline tests.
- [x] Implement schema and validated reader; wire a separate API handler with configured source.
- [x] Run focused tests and full tests; commit this task (`484ae42`).

## Task 2: Web proxy and discovery screen

Files: web testnet client/proxy/components and tests, `/testnet`, route and navigation; CSS; browser smoke script; runbook/roadmap.

- [x] Write and observe failing proxy and user-flow tests.
- [x] Implement bounded proxy, manual snapshot screen, refresh/error/expiry states and desktop styling.
- [x] Run full tests/typecheck/lint/build; perform browser check if the runtime permits localhost (blocked by `listen EPERM` and Chrome access denial; owner check remains).
- [x] Run one independent final review; fix material findings through RED→GREEN tests.
- [x] Commit and record actual evidence plus owner checks. Leave public-testnet writes unqualified.

## Verification and choices

Implementation commits: `484ae42` (shared contract/API), `283f63a` (web proxy/page/browser script). Final verification: **514 Vitest + 82 Node tests**, typecheck, lint, production build and whitespace check passed. Existing React detection and Next workspace-root warnings remain. The independent reviewer found one material timeout regression: passing a study signal through `fetchOptions` replaced viem's eight-second request signal. The actual-source regression test failed first, then passed after composing both signals in `fetchFn`; another transport test proves a late request is aborted at the whole-study deadline. No other actionable findings were reported. Author handled the fix with RED→GREEN and a green full suite; no second review was dispatched.

Choices made under the owner's autonomous authorization, in order:

1. Expose all six quote samples without choosing a pool, so an unfunded owner can inspect live depth. If unsuitable, repeat the study before selecting a pool.
2. Use a 45-second study cap, concurrent-request deduplication and no completed-result cache. A slow provider can report unavailable and require a better RPC.
3. Preserve the feature branch and mark browser/live evidence pending: localhost binding failed with `listen EPERM`, browser transport was unavailable, and native Chrome access was denied. Host-only rendering or provider issues may need a follow-on fix.
4. Keep live pool suitability, public-testnet wallet execution and receipts explicitly unverified; defer mobile polish as requested. Transaction and desktop evidence must pass before claiming demo execution readiness.

No deferred minor findings. The owner should run `pnpm testnet:depth`, open `/testnet` with `pnpm dev`, and run the deterministic browser script in the [runbook](../../research/2026-10-01-base-sepolia-testnet-preflight.md). These checks need no funded wallet. Public-testnet swap and LP lifecycle remain next stages.
