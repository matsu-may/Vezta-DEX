# MetaMask EIP-7702 support — session report

## Scope and decisions

Base Sepolia 84532 standalone desktop demo only. The owner selected support for MetaMask Smart Account after Confirm converted reviewed approvals into relayed type-4 transactions. The supported profile is the pinned MetaMask delegation framework v1.3: one SINGLE/DEFAULT zero-value call, one signed root delegation, ordered LimitedCalls(1) and ExactExecution caveats, empty caveat args and canonical encoding. Batches, TRY, extra grants, arbitrary delegates and other chains remain rejected.

Four deployed manager/delegate/enforcer runtimes were independently rebuilt with solc 0.8.23 and matched exactly, including metadata. The sanitized [proof manifest](2026-10-03-metamask-runtime-proof.json) is committed; raw signatures, compiler tooling and RPC credentials remain local. Deployed Uniswap contracts are reused; no new DEX contract was deployed.

## Changes

- Shared delegation signature/call decoder; pinned wallet-code classifier; API runtime and execution-time proof. Parent code/nonce plus canonical block authorizations prevent end-of-block code from being mistaken for execution-time evidence.
- Swap and LP accept the qualified delegated account while retaining direct legacy/type-2 validation and existing token, minimum, owner, event and receipt checks.
- Outer relayer nonce/fees are independent of the reviewed inner operation. UI shows MetaMask execution, actual gas payer and observed L2 cost. Charged L1/operator totals remain explicitly unqualified.
- New swap contexts persist privately for 24 hours with bounded schemas, permissions, atomic saves and safe orphan-temp handling.
- Old lost approval contexts use separate read-only historical reconciliation. The browser binds the result to retained wallet/hash/token/spender/amount, requires explicit acknowledgment and preserves history. No old swap/LP review is recreated.
- Recovery rejects unproven pending wrapper candidates and old same-call receipts before binding an immutable context hash. Regression tests cover subsequent correct recovery.

## Actual owner approval

Read-only verification qualified `0x889a6ff469519954beb459f2ce04dfabb4bd957e6b5c00b7b05230fbe7fbe3b1` as successful exact **1 USDC approval** to the curated SwapRouter02 for wallet `0x2c90304a4A0570221af2d997ccAc8f1Bc722D99a`. The outer payer was a relayer. The RPC encoded an authorization scalar as an unpadded hex integer; normalization now preserves the signed integer before recovery and has a RED→GREEN regression.

## Verification and remaining acceptance

Final integration gates: `pnpm test` passed **129 Vitest files / 961 tests**, with one existing skip, plus **85 Node script tests**; `pnpm typecheck` and `pnpm lint` passed (existing React auto-detection warning). Production `next build --webpack` passed from an isolated copy to preserve owner `next-env.d.ts` and running services. Desktop browser mocks passed **26 swap/recovery checks** and **49 LP checks**, including delegated connection, explicit review, gas payer/cost, rejected prompts, reload/recovery and no automatic resend. Independent review findings were corrected with RED→GREEN regression tests.

Local delegated fork: type-4 authorization/approval, subsequent relayed type-2 swap and LP operations use real pinned deployed bytecode with fixture funding. Cold mint gas estimation initially exceeded the RPC transport timeout; the disposable validation harness alone uses a 60-second estimate timeout. Public production deadlines and RPC settings were not raised. The complete delegated lifecycle passed: type-4 approval, type-2 swap, LP exact approvals/reset, mint, increase, partial/full decrease, collect and burn. All 13 wrapped executions were qualified by the shared verifier; LP operations also passed the production study/recheck/receipt reader. The owned fork snapshot was reverted and Anvil stopped. Charged L1/operator total-fee qualification remains false. Local fixture keys are public deterministic test keys and were used only on owned disposable forks; no owner funds or public agent broadcasts were used. Browser tests intercept API requests and mock wallet prompts. These checks do not replace installed MetaMask/public-testnet acceptance.

Next owner steps: follow the updated [desktop guide](2026-10-02-testnet-desktop-owner-guide.md), reconcile the preserved approval, reconnect the same account, request a fresh quote and complete one reviewed swap. Check the original hash and verified output before acknowledgment. Then accept reverse swap and LP mint/increase/decrease/collect/burn on `/demo/2` as needed. Preserve/report any unresolved hash rather than resending.

After the desktop demo, revisit the complete existing testnet roadmap and selective Uniswap SDK/source strategy. Mainnet, Vezta integration and mobile remain outside this session.
