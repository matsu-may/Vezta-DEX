# Approval EOA validation — 2026-09-29

## Scope and existing decision

The owner previously selected EOA-only signing on Polygon. The approval reader now applies that same boundary before returning an unsigned ERC20 transaction. The installed MetaMask read-only functional scenarios are also closed by owner confirmation; browser and wallet versions remain unrecorded. These reports do not establish approval, signing or funded swap behavior.

## Behavior verified

- Snapshot the validated intent before asynchronous chain reads.
- Read raw `eth_getCode` and token allowance at the same Polygon block. The existing production source verifies Polygon chain ID and preserves explicit empty code.
- Permit allowance reads only for exactly `0x`. Deployed code or EIP-7702 delegation returns HTTP 200, `plan.kind: blocked-account`, `currentAllowance: null` and no transaction. No raw code is returned.
- Missing/malformed code and failed RPC reads fail closed with the existing generic HTTP 503 response; credentials and upstream errors are not exposed.
- Recheck the existing block freshness limit after code and allowance reads. Reject negative block values, unsafe timestamps and non-uint256 allowances.
- Preserve exact approval and zero/exact/other-nonzero allowance policy for supported EOAs.

## Verification observed

| Command | Result |
|---|---|
| Focused allowance tests before implementation | 16 failures / 21 tests, demonstrating missing account gate, freshness and snapshot protection |
| Focused allowance tests after implementation | 21 / 21 passed |
| `pnpm test` | 356 Vitest tests and 28 Node script tests passed |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed; existing React-version detection warning remains |
| `pnpm build` | Passed |

Handler regressions also cover the transaction-free blocked response and sanitized code-read failure. Build regeneration of `apps/web/next-env.d.ts` was reversed to preserve the owner's pre-existing development import; that file is excluded from these changes.

## Limits and next gate

No live RPC probe, wallet prompt, signature or transaction was performed in this change. A pinned block is an observation, not a reservation: future browser prompts must recheck account, chain, code, allowance and current intent. Live signed calldata, funded approval/swap receipts and executed balance/allowance evidence remain pending. Receipt helpers remain unwired to wallet controls.

## Independent review and rulings

Fresh-context read-only review of `de0cd35..3942954` found no Critical, Important or Minor issues requiring correction. The reviewer independently ran allowance, HTTP handler, production source and exact approval tests without cache: **38 / 38 passed**. Full-suite/build results were supplied evidence, not independently rerun. The owner change in `next-env.d.ts` remained untouched.

Every item the reviewer declined to independently judge remains bounded as follows:

- Installed-wallet execution: retain owner attribution and unknown versions; do not claim agent observation.
- Live RPC behavior: source inspection and deterministic tests establish wiring, not provider reliability; a live probe remains separate.
- Funded approval/signature/swap: retain these release gates; this change enables no write control.
- Reorg or state change after preparation: a pinned observation does not reserve state; future prompt-time checks remain required.
- Prior receipt foundation: no implementation change here; its documented integration, finality and recovery obligations remain open.

The [local funded rehearsal proposal](../specs/2026-09-29-local-swap-rehearsal-proposal.md) offers a separately gated way to obtain the missing evidence. It awaits owner approval; no wallet action is authorized by recording this review.
