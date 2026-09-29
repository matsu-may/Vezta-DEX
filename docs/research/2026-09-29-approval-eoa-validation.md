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

Independent review will be recorded before proceeding.
