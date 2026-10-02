# Base Sepolia wallet controller and recovery group

## Brief and boundary

The owner accepted final recheck/receipt consumers at fork block 47574990. Continue Phase 3 independently with a headless wallet controller and versioned recovery record; no UI changes, public execution switch, new dependency or main Vezta integration. User standing authorization permits routine design choices and local implementation without repeated approval handoffs.

## Design and decisions

- Reuse core intent/quote/calldata inspectors and server recheck/receipt contracts. Controller actions are explicit: connect, quote, review approval/reset or swap, submit, observe/recover original hash and acknowledge a verified terminal result. No wallet prompt at construction, automatic chain switch, signing, send retry or automatic continuation.
- Final review invokes the server recheck once, which consumes the quote and returns an immutable context. Reject changed intent/quote/transaction/nonce/gas/deadline/funding/simulation/runtime data. Local account/chain checks and original quote expiry run again immediately before a wallet prompt.
- Sending requires an explicit trusted consumer gate AND server execution permission. Both remain disabled in the current product; mocked tests may qualify the state machine without real signing/broadcast. The API still returns executionEnabled:false.
- Store original context ID, reviewed quote/transaction, tracking expiry, attempt time and hash before requesting the wallet. Persist no credentials or signatures. Lost response/reload never reopens submission. Definitive wallet rejection clears the attempt but consumes the review; another action needs a fresh quote.
- Use an origin-wide nonqueued Web Lock, compare-and-write recovery storage and generation invalidation for wallet/input changes. Preserve original submissions even when account/chain changes during the wallet prompt. Recovery reads receipts without asking the current wallet to connect.
- Receipt statuses remain distinct. Unknown/advanced nonce does not prove cancellation or replacement. API restart/context loss blocks continuation. Verify context/hash/kind/chain and bound economics; latest observed balances are not transaction deltas. Only explicit acknowledgement of a verified terminal result can clear tracking.

## Implementation plan and interfaces

1. RED→GREEN contracts/storage: validate real recheck fixtures, original payload, exact approval policy, caps/freshness, storage corruption/conflicts and receipt identity/economics. Producer: core + existing API; consumer: browser controller. Keep server gas envelope exact.
2. RED→GREEN controller: both directions/reset/approval, disabled gates, expired/altered/late responses, rejection, uncertain send, reload recovery, wallet changes, storage failure and overlapping consumers. Producer: validated review/record; consumer: injected wallet/API with an exclusive coordinator. All mocks stay local.
3. One fresh group review, fix material findings with RED→GREEN, then one full test/typecheck/lint/build gate. Record decisions and handoff here. Preserve unrelated next-env changes.

## Progress

- [x] Contracts and storage: actual backend fixtures accepted, malformed bindings rejected; strict compare/write recovery records.
- [x] Explicit controller and deterministic tests: both directions, reset/exact approvals, dual disabled gates, original-hash recovery, late results and account changes.
- [x] Group review and final gates: 746 Vitest +85 Node passed; typecheck, lint and build passed.

## Remaining acceptance

No new old-fork probe is required for this headless slice. Browser client/proxy, desktop UI, measured quote-to-wallet latency, installed-wallet compatibility, faucet-funded public receipts and actual L1/operator fees remain later gates. Mobile and main Vezta integration are deferred.

## Review and decisions made

- One fresh group review found recovery could persist a candidate hash from `reorged` even when the backend had not identified that transaction. RED reproduced the permanent wrong-hash binding; GREEN persists only pending/confirming/confirmed/reverted identity-proving responses. Cost of this conservative choice: a reorg alone requires another explicit original-hash check.
- A failed hash-storage update retains the original hash in memory. A strict same-context/hash-null compare permits repairing that marker under the existing lock, without resending or replacing a different record. RED→GREEN covers temporary storage failure. Conflicting records stay blocked; cost: no automatic cross-context repair.
- Initial account-grant events are distinct from account changes. Stale or failed receipt refresh cannot acknowledge an old success. Both edge cases have RED→GREEN evidence.
- Review labeled the one-listener mock a Minor, but its defect prevented the explicitly required mid-prompt account-change test from exercising the submitting controller. Treat that coverage gap as material for this group's promised verification: the new assertion failed, then a multi-listener mock passed. No product behavior changed and no extra review round was requested.
- No remaining Critical/Important review findings. All execution permission switches remain disabled in the product. Test mocks deliberately enable the injected consumer and server permissions; they do not qualify public execution.

## Final verification and compact handoff

2026-10-02: focused 14 tests passed, followed by one final full suite: **746 Vitest +85 Node passed**, one explicitly opt-in native integration test skipped. The unchanged native harness is already accepted by the owner at block 47574990, so it was not repeated for this headless-only slice. `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Initial typecheck exposed test-fixture address typing/read-only permission properties; normalize fixture intents through core parsers and use copied mock permissions. Existing React-detection and Next workspace-root notices remain; no UI change required a browser run.

Accepted gates: runtime rebuilds/pins, oracle/unfunded studies, original funded fork47573721, updated final-context/receipt fork47574990. Do not rerun them absent a concrete regression. The scoped Phase-2 swap foundation is accepted; later creation-bytecode/descriptor/public fee concerns stay recorded separately.

Implemented: strict browser quote/recheck/receipt contracts, versioned original-context storage, explicit headless controller, dual execution gates, cross-tab exclusion, uncertainty/recovery and verified terminal acknowledgement. No browser route/component imports this controller yet. Product APIs still return executionEnabled:false.

Next independent group: bounded same-origin browser client/proxy and desktop UI using token-launchpad styling; wire connect/quote/review and original tracking with execution disabled. Measure the original 30-second quote budget, then deterministic browser rejection/expiry/reload/account/chain checks. Public wallet compatibility and actually charged Base fees need capped owner-operated testnet acceptance before enabling submission. LP and complete desktop/demo handoff follow; mobile and main Vezta integration remain deferred.

Owner action for this group: **none**. No real USDC, new fork run or repeated RPC/source commands are needed. Preserve unrelated `apps/web/next-env.d.ts`; no push, merge, deployment or public broadcast was performed. Use functional groups, one review/final gate and this consolidated handoff to avoid duplicated work after compaction.
