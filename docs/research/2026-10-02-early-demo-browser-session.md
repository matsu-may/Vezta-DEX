# Early testnet demo — browser implementation checkpoint

## Active brief

Owner authorized independently completing early-demo steps 1–2 and a detailed Vietnamese step-3 guide. Follow docs/superpowers/plans/2026-10-02-early-testnet-demo.md, then resume full testnet roadmap. Standalone only; desktop follows token-launchpad; mobile deferred. No owner signing/broadcast, main integration, source rebuild, repeated accepted fork probes or deployment.

BASE2131cc4; controller5f1d159. Accepted fork47573721 and recheck/receipt fork47574990. Previous full local gate746Vitest+85Node. Owner next-env.d.ts modification must be preserved/excluded.

## Selected design and interfaces

- Keep /testnet as the demo entry. Add compact verified-pool Explore card plus explicit wallet swap panel; existing discovery remains available as detailed read-only diagnostics.
- Bounded same-origin POST client/proxy for quote/recheck/receipt only; preserve backend statuses/sanitized codes (especially410/429), validate requests, no arbitrary URLs or upstream payload logging. No per-endpoint automatic retries.
- Default remains read-only. An explicit localhost-only development testnet launcher enables the server and browser gates together for capped owner-operated testnet acceptance. The private API never signs/broadcasts; flags apply only to Base Sepolia HTTP consumer metadata, not Polygon, CLI or general production. Validate configured binding and request origin boundary; no NEXT_PUBLIC secret/permission flag.
- Existing headless controller supplies exact transactions, nonce/gas, 30s deadline and original-context tracking. UI lists kind/amount/router/token/nonce/gas/complete snapshot budget before explicit submit. Unknown outcome requires original-hash recovery, never a resend. No automatic approval→swap continuation.
- Recheck response must expose the validated fee/funding summary to the UI without persisting credentials/signatures. Maintain strong validators and no stale snapshot return.
- Model public-testnet receipt L2 charge separately from unqualified actual L1/operator fees. The first capped owner transaction supplies those external acceptance data; do not claim public qualification from fork/mock.

## Task ledger

1. Client/proxy + opt-in gating: complete. Fixed localhost POST quote/recheck/receipt, bounded bodies/timeouts/rate starts, explicit known error-code allowlist, default execution=false. API never signs/sends. Launcher refuses production/arguments/occupied ports; owned group cleanup only. Actual full launcher startup on3020/3021 awaits the owner stopping their existing dev session; gate/binding/refusal checks passed here.
2. Desktop UI + controller summary: complete. RED→GREEN review/input and UI tests; only explicit MetaMask prompts/actions, exact/reset approvals, full buffered snapshot budget, stale/input/account invalidation, original-hash tracking. Minor reviewer allowance concern fixed RED→GREEN: original approval event and current allowance/mismatch are separate.
3. Deterministic browser smoke + screenshot: complete. Wallet15checks, discovery8checks passed. Mock-only disposable profiles, no signatures/public sends. Desktop screenshot visually inspected; mobile remains deferred.
4. Fresh group review/final gates/guide: complete. No Critical/Important. 757 Vitest +85 Node passed, one native opt-in integration skipped; typecheck/lint/build passed. Owner next-env preserved. Detailed Vietnamese guide and both roadmaps updated. Final scoped commit includes only this group.

## Resume rules

Read this file and git status/log first after compaction; continue first pending task, never restart completed work. Log each actual gate/result and ruling here while working. Test output goes to /private/tmp; no secret/env value output. Preserve unrelated next-env before/after build. No explicit compact tool is available in this session; this checkpoint supports automatic context compaction.

## Final evidence and resume context

- New same-origin transport real read: quote200/11095ms, approval recheck200/7216ms; correctly blocked `TESTNET_INPUT_BALANCE_LOW`, execution=false. No funded public latency or MetaMask fee-envelope compatibility claim. Do not loosen30s deadline or minimum to compensate.
- Final mock wallet browser15checks/apiCalls23; depth8checks/apiCalls2. Screenshots `.playwright-cli/testnet-desktop.png` and `testnet-depth-desktop.png` are ignored local artifacts. Existing depth smoke updated to open the newly embedded diagnostics and use the CLI function-expression format.
- Final tests97files/757passed+1skipped, Node85passed. Logs `/private/tmp/vezta-dex-demo-full-test-final.log`, `vezta-dex-demo-types-final.log`, `vezta-dex-demo-lint.log`, `vezta-dex-demo-build.log`. React auto-detection and Next workspace-root notices remain non-blocking; browser console showed only Chromium local-network HMR websocket restrictions. No final hydration/app errors.
- Concrete gate fixes required repeat checks: asynchronous controller subscription initialization now respects React lint and uses unmount guards; tests wait for mounted UI. Browser assertions were scoped to wallet alerts (Next route announcer also has rolealert); reload compares API count before/after rather than incorrectly requiring whole-session zero. No application safety gate was relaxed.
- Selected decisions: direct verified v3 testnet adapter, fixed pool/amount ranges/slippage, opt-in localhost HTTP consumer, no autoplay approval→swap or resend, explicit receipt checks, honest snapshot-vs-charged-fee labels, desktop-first. No dependencies/contracts/source pins altered; no main Vezta integration or owner process terminated.
- Resume: owner completes [step3 guide](2026-10-02-early-testnet-demo-owner-guide.md). Inspect public hashes and funded latency/charged fees; resolve any real compatibility issue, then resume Base Sepolia LP Phase4 and standalone product/handoff Phase5–6. No repeated source rebuild/fork probes without a concrete changed risk. Check git status/log before new work; exclude owner next-env.

## Follow-up — connection diagnostics

Owner reported generic Connect failure and then identified that MetaMask was on Sepolia rather than Base Sepolia. Connect has no API calls or funding checks; wrong chain is intentionally rejected. Reproduced the misleading generic message with RED tests. Added safe connection-specific wrong-network/rejection/pending/unknown-provider messages without changing transaction validation or prompting automatically. Browser mock confirms Ethereum Sepolia blocked, explicit switch to Base Sepolia then connection succeeds, API calls0. Owner must add/select Base Sepolia84532 and connect again; guide includes this distinction.

Owner subsequently confirmed successful connection on chain84532. Follow-up quality gates:759Vitest+85Node passed,1opt-in skipped; typecheck/lint/build passed. Only connection diagnostics and guide changed; no source/API/transaction policy relaxed.

## Follow-up — standard wallet and recording route

Owner funded wallet20USDC/.0002testETH. First public approval hash b53df0...success event1USDC but type4 EIP7702 relayer envelope unsupported. Direction A authorized: preserve unresolved original, require different standard account, do not add smart-account support or weaken receipt checks. Added `/demo/1` desktop launchpad-style presentation sharing controller/gates/history with technical `/testnet`. Manual archival only fresh unverified hashed approval/reset; preserved bounded history, original wallet blocked, emptycode checks before actions. Detailed policy/evidence/owner instructions: `2026-10-02-demo-01-and-standard-wallet.md`.

Fresh group reviewer: no Critical/Important; checkbox carry-over fixed with per-hash acknowledgment RED→GREEN. Narrow viewport recording layout minor deferred per owner mobile scope. No public swaps sent or accepted. Original MetaMask delegated account still unsupported; owner must use new standard account and report public swap receipts.

Follow-up verification: 99 files /764 Vitest passed,1 opt-in integration skipped;85 Node tests passed; typecheck/lint passed. Mock browser `/demo/1`:20 checks/apiCalls26 passed, desktop screenshot `.playwright-cli/demo-01-desktop.png` inspected. Browser fixture needed await of archival/connection completion before storage/button assertions; transient harness failures were not product acceptance failures. First CLI run stopped only its owned disposable browser; no owner processes stopped. Final browser closed. Build result recorded below after completion. Tests did not resend the owner's public approval.

Final build passed, including dynamic `/demo/1`; unrelated owner `apps/web/next-env.d.ts` preserved and excluded from commit. Read-only original receipt research only; no new public sends. Next: owner archives the fresh unverified approval, selects/funds a new nondelegated standard account and performs capped two-way swaps. Do not redo historical source/fork qualification. No change to `/testnet` API origin, route permissions, runtime pins, expiry, fee or calldata validation.


## Follow-up — demo issue diagnosis and context-loss quarantine

User asked to fix demo issues and continue. Optional request for the latest concrete error remains unanswered; independent source investigation found receipt codes missing from safe allowlist and generic unverified UI. Fixed bounded receipt busy/timeout/stale/invalid propagation and known-code guidance. Added enum-only unverified diagnostic (unsupported type/transaction mismatch/receipt mismatch/event mismatch/missing tx), proxy strips/rejects unexpected details; validation gates unchanged.

Ruling: API contexts are memory-only and hot reload/restart can lose the owner's original context. Permit explicit quarantine of a hashed approval/reset on backend410 CONTEXT_UNAVAILABLE or local24h context expiry as well as a fresh unverified observation. This is not verification. Full original archived first, old wallet blocked on every action, different standard account required; swap/no-hash and ordinary pending outcomes cannot be archived. Cost/limitation: unresolved old approval requires manual review; browser storage loss removes local history, public receipt fee/envelope support still not qualified.

Fresh focused reviewer found no material issues; stale pending instruction for unavailable context fixed RED→GREEN. Browser22mockchecks/apiCalls29passed (new lostcontext and diagnostic scenarios), no real sends; existing desktop screenshot retained. Complete guide now has a recording checklist and actual recovery states. Next public acceptance still requires owner standard account + two capped signed swaps; do not redo runtime rebuild or fork evidence. LP/product phases remain after the early demo milestone, mobile deferred.

Final follow-up gates:99files/770Vitest passed,1opt-in integration skipped;85Nodepassed; typecheck/lint/buildpassed. Browser22checks/API29passed; owned disposable browserclosed. Logs `/private/tmp/dex-demo-fixes-full-final.log`, `dex-demo-fixes-types-final.log`, `dex-demo-fixes-lint-final.log`, `dex-demo-fixes-build.log`, `dex-demo-errors-browser.log`. Owner next-env preserved/excluded. No public swaps/signatures/broadcasts. Stop at owner-operated standard-wallet acceptance, not another historical RPC/source/fork probe.
