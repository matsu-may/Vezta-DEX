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
- [ ] Run one independent final review; fix material findings through RED→GREEN tests.
- [ ] Commit and record actual evidence plus owner checks. Leave public-testnet writes unqualified.
