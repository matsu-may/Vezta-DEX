# Direct EIP-1559 compatibility session — 2026-10-03

## Result and scope

Implemented direct type-2 transactions for the standalone Base Sepolia swap and LP demo. Historical direct legacy records remain readable. Public MetaMask acceptance is still pending; successful local qualification does not complete that gate.

The owner's two successful explorer approvals were wrapped EIP-7702/type-4 transactions with a relayer. They remain unsupported and `unverified`. Turning off Smart Account cannot rewrite an existing hash. This update must be tested with a newly reviewed direct transaction; it does not qualify those historical approvals.

## Changes and choices

- Added coupled fee fields to core/API/web contracts. `gasPrice` remains the DTO budget ceiling for compatibility; actual type-2 wallet requests contain only `type`, `maxFeePerGas` and `maxPriorityFeePerGas` fee fields.
- Production planning reads pinned base fee and suggested priority, sets max fee to twice base plus priority, and retains existing gas/amount/TTL bounds. A failed production fee read does not silently fall back to legacy.
- Review displays the fee model and caps. LP details are under **Transaction and fee details**. Recovery preserves the reviewed envelope; no automatic re-send or archived-wallet unblocking was added.
- Receipts bind sender, target, nonce, calldata, gas and original caps. Effective gas price is checked against canonical receipt-block base fee, then existing event/NFT/payment and confirmation checks apply.
- Independent review found the canonical receipt base-fee bound was narrower than the supported cap. Fixed it without widening the planning bound; a production-source regression passed.
- Retained current deployments and pinned source/runtime evidence. No new AMM, contract deployment, public transaction, mainnet integration or Vezta integration.

## Verification actually performed

| Check | Result |
|---|---|
| `pnpm test` at integration | 121 Vitest files: 885 passed, 1 opt-in skipped; 85 Node tests passed |
| Post-review source/envelope regression | 2 files, 17 tests passed; new bound test observed failing before the fix |
| `pnpm typecheck`, `pnpm lint` | Passed, including after the review fix |
| Next production build | Passed from an ignored isolated workspace copy, including its API test-helper dependencies; owner's running `.next` and edited `next-env.d.ts` preserved |
| Production fee source | Read-only pinned Base Sepolia fee read passed |
| Desktop browser mock | Type-2 swap: 23 checks/29 intercepted API calls; LP: 31 checks/41 calls. Every mock send required type-2 caps and rejected a `gasPrice` RPC field; fee display and recovery checked |
| Disposable swap fork | Reset/exact approvals and both swap directions verified with context-bound original receipt tracking; snapshot reverted, owned Anvil stopped, no owner funds used |
| Disposable LP wallet fork | Exact approval/reset, mint, increase, partial/full decrease, collect, burn, restart recovery and allowance cleanup verified; snapshot reverted, owned Anvil stopped, no owner funds used |

The broad suite ran once. Follow-up runs addressed the specific reviewer finding and new type-2 integration boundaries. Browser fixture adjustments corrected a collapsed details locator and a missing mirrored fee descriptor, without production code changes. Existing historical deployment rebuilds were reused.

Forks report `actualTotalFeeQualified:false`: local execution does not prove actual public charged L1/operator fees. Public wallet behavior, original receipts and public fee acceptance remain owner checks.

## Owner handoff

Follow [Check the EIP-1559 update](2026-10-02-testnet-desktop-owner-guide.md#check-the-eip-1559-update). Preserve unresolved hashes first, then use `pnpm dev:testnet` when no transaction is pending. Check fee model/caps on `/demo/1`, qualify the new original receipt, acknowledge, and only then request a new quote. Follow the LP sequence on `/demo/2` after swap acceptance.

If the newly submitted hash is still type-4 or relayed, stop and report its hash plus diagnostic. Supporting that account's envelope requires a separate compatibility design; do not repeatedly send or bypass archived recovery. Do not label the demo complete until public acceptance passes.

## Required review after demo

The [main roadmap checkpoint](../superpowers/plans/2026-10-01-standalone-testnet-completion.md#required-checkpoint-after-public-desktop-demo) now requires reviewing accepted evidence, wallet compatibility, UX/data gaps and remaining DEX scope before further expansion. Prefer pinned official SDK packages; clone official Uniswap source selectively at pinned commits for learning, deployment/calldata comparison, debugging and tests. Add v4 sources only for an actual v4 adapter/hook need. A full AMM fork is a separate product/security decision.

Implementation references: [design](../superpowers/specs/2026-10-03-testnet-eip1559-design.md), [plan](../superpowers/plans/2026-10-03-testnet-eip1559.md).
