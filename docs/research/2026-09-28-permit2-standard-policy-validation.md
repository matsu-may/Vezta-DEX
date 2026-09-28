# Permit2 option 1 validation — 2026-09-28

## Approved policy and implemented boundary

The owner approved option 1: exact ERC20 and Permit2 amounts, at most 30 days of remaining Permit2 allowance, at most 30 minutes until the signature deadline, and a separate 30-second quote TTL. The original API PermitSingle data is validated without changing its signed values. The core rejects incorrect domain, chain, contract, ordered types, token, spender, amount, nonce, extra fields, overflows and unsupported timing. Timestamp-zero and on-chain permitTransaction flows are rejected by this first message adapter.

`POST /api/v1/permit-plan` takes the original intent and its opaque quote ID. It reads `Permit2.allowance(owner, token, UniversalRouter)` at a pinned recent Polygon block and checks the saved quote again after the read. Nonce mismatch, expiration or a concurrently consumed ID prevents a signing plan. The response contains only validated typed data and quote/block timestamps; the full upstream quote stays on the server. Reading does not consume or extend the quote. Future swap preparation must consume it once and verify signature, actual calldata and current chain state.

If the API returns `permitData: null`, the plan is `ready` only when the on-chain router allowance equals the input amount and expires within the approved cap. Other states return `blocked-existing`. This does not bypass the separate exact ERC20 approval requirement. No browser signing, transaction broadcast, automatic revoke or reset is enabled.

PermitSingle signs permission for a spender, not the output token, recipient or minimum received. Those are application quote bindings and future calldata checks. A checked nonce is a snapshot, not a reservation. See the [approved spec](../specs/2026-09-27-trading-api-swap.md) and [implementation plan](../superpowers/plans/2026-09-28-permit2-standard-policy.md).

## Automated and live evidence

Core policy tests cover 30 cases. API tests cover pinned state, null permits, wrong intent/nonce, unsupported messages, timing races and error redaction. The quote-store regressions prove reads neither consume nor renew IDs. Final verification: **160 Vitest tests and 8 Node tests passed**; `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `node --check scripts/smoke-permit-plan.mjs` passed. The existing React-detection lint warning and Next.js ancestor-lockfile warning remain.

**Independent review:** one Important compatibility issue was found: viem 2.47.18 infers EIP712Domain chain ID only for number/bigint, so accepting domain `chainId: "137"` could produce the wrong digest. A regression first failed because this string was accepted; the validator now requires numeric `137` without rewriting the message. The regression and full suite passed after the fix. No other Critical/Important or Minor finding was reported. The reviewer did not rerun a second review; the fix was verified by the failing-then-passing regression and full suite.

The owner's earlier host probes verified the API's exact amount and approximate timing in both directions, but did not verify the full typed-data schema, spender or current nonce. These new checks still require a host-network run. Do not treat synthetic tests as live evidence.

## Host Terminal check (read-only)

From `vezta-dex`, restart the API so it loads the shared quote/permit readers:

```bash
pnpm --filter @vezta-dex/api start
```

In another terminal in `vezta-dex`:

```bash
node scripts/smoke-permit-plan.mjs
```

Expect two HTTP 200 results, normally `permitKind: sign` for the default dummy public wallet, and all identity/freshness/window booleans true with `leaksRawQuote: false`. The server validates complete types and chain nonce; the script prints neither typed data nor nonce. `ready` is valid only after the server verifies an existing exact allowance; `blocked-existing` requires investigating the existing permission, not weakening the guard. Nonzero exit status means the smoke gate has not passed.

`DEX_SMOKE_WALLET` may select a public wallet address. No key, funded wallet or signature is required. This probe requests quotes and reads RPC state only. Browser, funded approval receipt, post-approval requote, signed swap calldata, simulation and swap receipt gates remain open.

## Primary references

- [Uniswap integration guide](https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide): quote-specific permit data and paired signature/permit inputs to `/swap`.
- [Permit2 AllowanceTransfer](https://developers.uniswap.org/docs/protocols/permit2/concepts/allowance-transfer): canonical structs, nonce scope and distinct expiration/deadline.
- [Canonical Permit2 interface](https://github.com/Uniswap/permit2/blob/main/src/interfaces/IAllowanceTransfer.sol): allowance ABI and uint widths.
