# Receipt tracking foundation — 2026-09-29

## Implemented scope

This is a focused part of the [wallet-flow plan](../superpowers/plans/2026-09-27-trading-api-wallet.md), governed by the [Trading API spec](../specs/2026-09-27-trading-api-swap.md). It adds helpers for future wallet UI consumption; no component, API route or wallet control invokes them yet.

- `apps/web/lib/transaction-receipt.ts`: reads only through a dedicated Polygon public client. Validates the original hash, sender and approval-token/router target; checks receipt status, gas/block fields, RPC chain before/after reads, canonical block hash/number and an uncached head. Missing receipt, insufficient confirmations, reorg, wrong chain and RPC failure are separate observations. Raw transport errors are replaced with fixed reason codes.
- `apps/web/lib/receipt-tracking.ts`: copies/freezes the original transaction identity, retains its hash when the form/account/network changes, and distinguishes pending, confirming, delayed, unavailable, confirmed and reverted. Timeout is uncertainty, not permission to resubmit. A late receipt can resolve that original transaction.
- Successful confirmation requests a balance refresh for the original Polygon account, once per canonical inclusion. Confirmed approval requests a fresh quote only for an unchanged intent; it never represents a successful swap. Repeated or older observations do not repeat these effects. A changed canonical inclusion can request refresh again.

The confirmation count and wait timeout are explicit caller parameters. Test fixtures use two confirmations and a 60-second wait; these values are not production defaults. Canonical inclusion at a configured count is not proof of irreversible network finality. Receipt success alone also does not establish executed token amounts or allowance state; those require transaction/calldata, event and post-receipt reads in the future flow.

## Verification

- Reader tests ran RED with the module missing, then GREEN: 33 tests using real viem over controlled JSON-RPC responses.
- Lifecycle tests ran RED with the module missing, then GREEN: 33 tests. Test-fixture issues (BigInt formatting in test names and mutable fixture typing) were corrected before the successful run.
- `pnpm test`: 336 Vitest tests and 28 Node script tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0. Existing React-detection and Next.js workspace-root warnings remain.
- Next.js build regenerated `next-env.d.ts`; the owner's pre-existing development import was restored and excluded from these commits.
- Independent fresh-context review of `6a9247f..c637000`: no Critical/Important findings; reviewer independently ran 66/66 focused tests without cache. One deferred Minor is recorded below.

No live receipt, wallet signature, token approval or swap was generated. These tests validate our adapter and lifecycle logic, not a deployed application's funded flow.

## Required follow-up

1. The owner has now confirmed all installed-wallet read-only functional checks, including account change and account-access rejection/retry. Record browser/MetaMask versions when available; results retain owner attribution in the [wallet validation record](2026-09-28-wallet-connection-validation.md). Wallet-write checks are separate.
2. Implement the approval/Permit2/submission component and use a fixed Polygon receipt source with bounded transport timeout and serialized polling (or a monotonic read sequence). Retain submitted transactions independently of form state, and apply effects to the original account's cache. Equal millisecond timestamps alone do not order overlapping reads.
3. Handle wallet speed-up/cancel/replacement explicitly. This reader follows the original hash only; a replacement cannot be counted as success without validating its transaction intent.
4. Select and document production confirmation/wait policy and recovery across reloads before enabling writes.
5. With owner-approved disposable funds, verify exact approval receipt and allowance, refreshed quote, signed API calldata, simulation, small swap receipt, gas and executed output. Future orchestration must also refresh native gas balance after a confirmed revert. Obtain review before enabling controls.

## Review finding and execution rulings

**Deferred Minor:** `receipt-tracking.ts` accepts observations with equal `observedAt` values. Overlapping reads started within one millisecond can let an older pending result follow a confirmed result. This cannot resubmit a transaction or duplicate ordinary balance effects, and no polling/UI consumer exists yet. Serialized polling or monotonic sequence tracking is required at integration; do not describe timestamp comparison as sufficient for concurrent ordering.

| Ruling | Reason and cost if wrong |
|---|---|
| Continue inline on the existing feature branch | Owner authorized continuation; another checkout would disrupt local wallet checks. Cost: no second worktree isolates changes; scoped commits preserve ownership. |
| Prepare the read-only receipt foundation before remaining live-wallet checks | No prompt, signing or submission is added. Cost: the helpers may need adaptation after live observations. |
| Require explicit confirmation configuration without a production default | The spec has not selected a finality policy. Cost: the release must still select and document its policy. |
| Leave the full approval/permit controller for its own slice | This plan implements receipt reading/lifecycle only. Cost: the complete wallet flow remains unfinished. |
| Defer caller integration obligations together | Confirmation/wait policy, polling, transport timeout, fixed-client construction, reload persistence, background monitoring and replacement/speed-up/cancel handling are documented future work. Cost: premature integration could lose tracking or incorrectly treat a replacement as the original transaction. |
| Treat receipt success as EVM status, not economic verification | Executed amounts/logs, allowance, gas refresh after revert, calldata correctness and submitted-hash provenance belong to validated submission and later reads. Existing router/permit preparation is not re-reviewed here. Cost: treating this helper as complete verification could display wrong balances or trade amounts. |
| Trust the configured Polygon RPC while preserving uncertainty and correction | Receipt/transaction membership and consensus are not independently proven. Separate calls can straddle reorgs; confirmed state may later become unavailable. Different canonical inclusions may legitimately request refresh again. viem normalizes wire representations before semantic validation. Cost: a hostile/inconsistent provider or reorg can yield incorrect or temporary status; this is not irreversible finality. |
| Keep lifecycle observations/state internal and require matching reader/tracker policy | Consumers must use validated reader output and the same confirmation threshold. Cost: arbitrary forged state/observations could bypass canonicality, which the pure helper cannot independently prove. |
| Keep the review scoped and preserve outstanding release gates | Live-wallet reports retain owner attribution; UI/accessibility/actual cache refresh, credentials/env values and unrelated existing code were outside the changed scope. The existing branch ruling stands. Cost: these unverified integration behaviors still need their own gates before release. |

These grouped rulings cover every item the reviewer declined to judge. No Critical/Important fix pass was required. No merge, push, deployment or wallet transaction occurred.

## Sources

The implementation uses the pinned viem 2.47.18 package source and official documentation: [public actions](https://viem.sh/docs/actions/public/introduction), [getTransactionReceipt](https://viem.sh/docs/actions/public/getTransactionReceipt). It performs individual reads; the caller must configure bounded transport timeouts. It does not use an automatic replacement-capable waiter as evidence that a replacement preserves the user's original intent.
