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
- Independent review: pending at this record's creation; findings and resolution will be appended before completing this slice.

No live receipt, wallet signature, token approval or swap was generated. These tests validate our adapter and lifecycle logic, not a deployed application's funded flow.

## Required follow-up

1. Complete remaining installed-wallet account-change and account-access rejection/retry checks, recording browser/MetaMask versions. Existing owner-reported checks are in the [wallet validation record](2026-09-28-wallet-connection-validation.md).
2. Implement the approval/Permit2/submission component and use a fixed Polygon receipt source with bounded transport timeout and polling. Retain submitted transactions independently of form state, and apply effects to the original account's cache.
3. Handle wallet speed-up/cancel/replacement explicitly. This reader follows the original hash only; a replacement cannot be counted as success without validating its transaction intent.
4. Select and document production confirmation/wait policy and recovery across reloads before enabling writes.
5. With owner-approved disposable funds, verify exact approval receipt and allowance, refreshed quote, signed API calldata, simulation, small swap receipt, gas and executed output. Obtain review before enabling controls.

## Sources

The implementation uses the pinned viem 2.47.18 package source and official documentation: [public actions](https://viem.sh/docs/actions/public/introduction), [getTransactionReceipt](https://viem.sh/docs/actions/public/getTransactionReceipt). It performs individual reads; the caller must configure bounded transport timeouts. It does not use an automatic replacement-capable waiter as evidence that a replacement preserves the user's original intent.
