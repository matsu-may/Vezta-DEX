# Base Sepolia recheck and original receipt tracking

## Brief and accepted evidence

Continue phase 2 after the owner qualified the funded fork at block 47573721: reset/exact approvals, both swaps, confirmed receipts and cleanup passed. Reuse these readers to expose final recheck and receipt consumers. Work remains standalone; no frontend executor, main Vezta integration, new contract/dependency or public transaction is enabled in this group.

Use TDD on each behavior, one fresh review of the group and one final full test/typecheck/lint/build gate. Keep accepted host evidence; do not repeat earlier oracle/quote probes. This file consolidates design, decisions, checks and handoff rather than creating parallel status files.

## Contract

- `POST /api/v1/testnet/base-sepolia/recheck`: strict `{kind:"approval"|"swap",intent,quoteId}`. Repeat the appropriate runtime-guarded funded simulation/fee/state reader. Blocked/allowance-ready studies have no action context and do not consume quotes. A successful unsigned preparation validates the original minimum/deadline/approval, consumes the quote once and issues an opaque 48-hex context ID. It is an artifact, not wallet consent or execution permission.
- Contexts use a bounded single-process store (128, 24-hour tracking TTL, no live eviction). Tracking TTL does not extend the 30-second broadcast deadline. Original kind, full intent/quote, calldata, nonce, gas envelope and preparation block are immutable copies. Capacity/malformed/freshness failures precede consumption. Restart loses contexts and returns unavailable; no automatic recovery by inventing context or rebroadcast.
- `POST /api/v1/testnet/base-sepolia/receipt`: strict `{contextId,hash}`. Context supplies all expected economics; client cannot replace sender/recipient/spender/amount/minimum/nonce/calldata. Bind the first matching known transaction hash; reject changes. Unknown original hash or advanced nonce does not prove replacement/cancellation. No send or retry is performed.
- Read chain ID, a fresh stable head, original transaction/receipt and canonical receipt block. Require two confirmations and final head/receipt hash rechecks. Expose pending/confirming/unknown/reorged/reverted/unverified independently. Only matching sender/to/data/value/nonce/chain/gas and canonical success plus strict ERC20 events can become verified.
- Events prove original token spend/output or approve/reset amount. Balance and allowance reads describe the latest pinned block; they are not per-transaction deltas because other transactions can occur in the same block. A changed allowance is explicit; any next action still requires fresh recheck. Report L2 receipt gas separately with `actualTotalFeeQualified:false`; public L1/operator charged fees remain a separate gate.
- Existing strict 4-KiB JSON, no query, POST-only, no-store and sanitized error boundaries remain. The API is loopback and has no signer/private key. `executionEnabled:false` remains everywhere.

## Rulings

- Use server-issued immutable contexts instead of trusting receipt requests to supply expected calldata/economics — reduces client forgery; cost if wrong: additional single-process state/restart limitation.
- Keep receipt tracking for 24 hours without persisting credentials or signed data — supports pending/reload checks within one process; cost: API restart cannot recover a lost context in this slice.
- Verify event economics separately from observed balances/allowance — avoids false reconciliation from concurrent transactions; cost: browser continuation must check current allowance/state, not just receipt success.
- Keep public fee qualification open — fork evidence cannot prove Base's actually charged L1/operator fee or wallet compatibility.
- Reserve submission attempts synchronously in the shared context store, before the local send. A lost response cannot authorize another callback, overlapping consumer or retry; original-hash tracking remains available.

## Work checklist

- [x] Context store/recheck RED→GREEN: binding, once-only consumption, capacity, expiry, immutable copies, failed/late work and singleflight.
- [x] Receipt reader/source RED→GREEN: strict original identity, pending/unknown/reorg/revert, event economics, canonical rereads, changed state and error sanitization.
- [x] Route/main wiring and adapt the same disposable fork command to exercise receipt consumers.
- [x] Fresh group review, final gates, accepted evidence/roadmap update and one grouped host handoff.
- [ ] Owner EVM acceptance of the updated context/receipt consumers (distinct from the accepted original funded fork run).

## Verification and review

2026-10-02: focused fixes passed, followed by one final `pnpm test`: **732 Vitest +85 Node tests passed**. One native Anvil integration test was intentionally skipped because this agent environment forbids localhost binding. `pnpm typecheck`, `pnpm lint` and `pnpm build` exited zero. ESLint retains its existing React detection notice. No UI changed, so no browser test was repeated.

One fresh group review found an Important duplicate-submission defect: each prepared callback previously kept its own attempt flag. A RED test reproduced two callbacks for one context passing before a hash was returned. The shared-store attempt reservation fixes it; the test also rejects a third preparation after a lost response. Other identity/canonical/economic/privacy boundaries were reviewed without further Critical/Important findings. The reviewer checked positive viem wire-format compatibility without broadcasting. No additional review or old qualification probes were repeated.

## One updated host check

From `vezta-dex`, using the existing Base Sepolia RPC configuration and Anvil installation:

```bash
pnpm testnet:fork
```

No dev server, owner wallet, real USDC or public test funding is needed. The same disposable command now routes preparations through final recheck/context issuance and verifies each original receipt with the new reader. Every reset/approve/swap action row must include **`contextBound:true`, `trackingVerified:true`, `verified:true`**. The final summary must include **`verified:true`, `snapshotReverted:true`, `ownerFundsUsed:false`, `executionEnabled:false`**, followed by `owned-anvil-stopped`.

`actualTotalFeeQualified:false` remains expected. Send the JSON output only; keep provider credentials private. If a stage fails, retain its error and do not rerun old compiler/source/oracle/quote probes. This environment cannot execute the native funded integration, so this updated host result is unobserved.

## Resume without repeating work

- Accepted: five runtime rebuilds/pins, oracle/unfunded studies, original funded fork at 47573721. Preserve their evidence.
- Implemented and locally verified: final recheck, immutable contexts, shared once-only fork send boundary, original canonical receipt tracking and bounded routes. Public execution remains disabled.
- Pending: the single updated consumer fork check above. Then continue Phase 3 wallet controller, original-context recovery and deterministic desktop browser checks; public wallet acceptance remains owner-operated. LP, assembled desktop acceptance and final demo handoff follow. Mobile and main Vezta integration remain deferred.
- Practical next gate: measure quote→review→recheck→wallet latency under the original 30-second deadline. Optimize repeated RPC/UX only with concrete evidence; do not silently extend minimum/deadline or remove checks.
- Context storage is single-process and lost on restart; tracking lasts 24 hours, broadcast freshness only 30 seconds. Only the reviewed legacy gas/nonce/calldata envelope can be verified in this slice. Actual public L1/operator fees remain unqualified.
- Work in functional groups: focused RED→GREEN, one group review, one final full gate and one consolidated handoff. Preserve the owner's unrelated `apps/web/next-env.d.ts` modification; no push, merge or deployment has been performed.
