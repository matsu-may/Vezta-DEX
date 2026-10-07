# Full standalone testnet completion implementation plan

> Execute inline with superpowers:executing-plans; one fresh review at the final group checkpoint.

**Goal:** finish the independently verifiable testnet DEX requirements before one owner acceptance pass.
**Architecture:** preserve legacy Base records and qualified execution while separating chain configuration, proof and recovery. Use the accepted Unichain recommendation as the next qualification target; enable it only with its own proofs.
**Tech stack:** existing TypeScript/viem/Uniswap SDKs, Vitest, Anvil, pinned solc; no new application dependencies.
**Spec:** `docs/specs/2026-10-06-testnet-task-acceptance.md` and `docs/superpowers/specs/2026-10-06-second-chain-adapter-boundary.md`.

## Global constraints

- Work on the existing isolated branch; preserve owner checkout, active contexts and servers.
- No public signing, merge, push, deployment or mainnet/integration/mobile scope.
- Exact approvals, fresh chain/block/runtime/fee/simulation and original-hash receipt gates remain mandatory.
- Local fork warmup is bounded, read-only and only against an owned loopback Anvil; it cannot qualify or send a transaction.
- Missing actual fee components remain unknown. Another chain cannot inherit Base code hashes, fee activation or delegation proofs.
- A successful independent checkpoint precedes one consolidated public-wallet owner acceptance.

## Review focus

Warmup escapes loopback or becomes a public timeout exception; source compiler metadata is trusted without byte equality; chain configuration leaks into legacy Base recovery; unqualified fee totals are shown as paid; chain change/reload unlocks an unresolved submission.

## Task 1: Qualify custom-range LP fork

Files: new `apps/api/src/testnet-fork-warm(.test).ts`; modify `testnet-lp-wallet-fork-lifecycle.ts`.
Interface: `warmOwnedForkCall(boundary, origin, transaction, blockNumber, signal)` performs only bounded `eth_call` after loopback/chain/client checks. The lifecycle computes the existing SDK mint plan and warms it only after exact fixture allowances are present, before starting the unchanged wallet study.
- [x] RED: wrong origin/transport/chain/client and aborted calls cannot issue HTTP; valid fixture issues eth_call only with bounded gas, block, account and value.
- [x] GREEN: implement owned local read warmup; no production source timeout/simulation changes.
- [x] Focused tests; one owned custom-range mint/increase/decrease/collect/burn lifecycle proves original receipt and restart recovery; record actual output and cleanup.

## Task 2: Chain-specific source/runtime qualification

Files: new Unichain chain configuration and independently bounded source/rebuild modules/tests, proof fixture and report. Reuse compiler/source validation units where compatible; preserve Base behavior.
Interface: explicit chain-qualified dependency records; independently compiled full runtime equals on-chain bytecode with every immutable bound to official/read-verified configuration.
- [x] Record Unichain selection, current official mappings and live state; fetch five role sources.
- [x] RED: chain/address/source/settings/hash/immutable mismatch and missing proof rejected.
- [x] GREEN: compile verified sources using exact pinned compiler and compare full runtime.
- [x] Qualify independent Unichain fee-oracle configuration, EOA profile, canonical L2 inclusion policy and fresh per-intent pool depth; actual charged fee totals remain unknown.
- [x] Focused malformed-proof tests and one live read-only snapshot/rebuild report.

## Task 3: Executable chain adapter and handoff

Files: chain registry/core schemas, quote/LP planning/source/receipt/store consumers, API/browser chain selection and recovery, adjacent tests and owner guide. Refine exact interfaces from Task 2 proofs before modifying consumers.
Interface: chain-qualified context/intent plus compatible legacy Base serialization; each adapter owns deployment, fee/finality and envelope qualification.
- [x] RED/GREEN: wrong-chain state/quotes/allowances/contexts, legacy recovery, unresolved global write lock and selected-chain browser recovery.
- [x] Implement explicit testnet selection, swaps/LP/discovery and original-chain receipt handling; preserve Base defaults.
- [x] Unichain swap and custom-range LP forks qualified separately; desktop wallet/Explore mocks passed; no owner funds used.
- [x] Full suite, final typecheck/lint/build, one new-diff review and repaired regression pass; local checkpoint/evidence matrix.
- [x] Consolidate one-pass owner instructions; public Unichain acceptance remains open, full-task completion not claimed.

## Current checkpoint

Owner accepted **A: Unichain EOA first**; Base retains qualified EOA/MetaMask.
Five independent runtime proofs and the completed Base range fork are reused.
Unichain swap evidence is block64447049; LP evidence is block64447265,
NFT418172/range185160..186420. New shared `/networks/{slug}/{view}` routes support
both testnets with chain-specific stores, API, UI and original-hash recovery.
Final local gates/review and one consolidated public-wallet owner acceptance
remain distinct. See `docs/research/2026-10-06-unichain-eoa-session.md`.
