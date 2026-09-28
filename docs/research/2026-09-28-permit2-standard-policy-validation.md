# Permit2 option 1 validation — 2026-09-28

## Approved policy and implemented boundary

The owner approved option 1: exact ERC20 and Permit2 amounts, at most 30 days of remaining Permit2 allowance, at most 30 minutes until the signature deadline, and a separate 30-second quote TTL. The original API PermitSingle data is validated without changing its signed values. The core rejects incorrect domain, chain, contract, ordered types, token, spender, amount, nonce, extra fields, overflows and unsupported timing. Timestamp-zero and on-chain permitTransaction flows are rejected by this first message adapter.

`POST /api/v1/permit-plan` takes the original intent and its opaque quote ID. It reads `Permit2.allowance(owner, token, UniversalRouter)` at a pinned recent Polygon block and checks the saved quote again after the read. Nonce mismatch, expiration or a concurrently consumed ID prevents a signing plan. The response contains only validated typed data and quote/block timestamps; the full upstream quote stays on the server. Reading does not consume or extend the quote. Future swap preparation must consume it once and verify signature, actual calldata and current chain state.

If the API returns `permitData: null`, the plan is `ready` only when the on-chain router allowance equals the input amount and expires within the approved cap. Other states return `blocked-existing`. This does not bypass the separate exact ERC20 approval requirement. No browser signing, transaction broadcast, automatic revoke or reset is enabled.

PermitSingle signs permission for a spender, not the output token, recipient or minimum received. Those are application quote bindings and future calldata checks. A checked nonce is a snapshot, not a reservation. See the [approved spec](../specs/2026-09-27-trading-api-swap.md) and [implementation plan](../superpowers/plans/2026-09-28-permit2-standard-policy.md).

## Automated and live evidence

Core policy tests cover 30 cases. API tests cover pinned state, null permits, wrong intent/nonce, unsupported messages, timing races and error redaction. The quote-store regressions prove reads neither consume nor renew IDs. Final verification: **160 Vitest tests and 8 Node tests passed**; `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `node --check scripts/smoke-permit-plan.mjs` passed. The existing React-detection lint warning and Next.js ancestor-lockfile warning remain.

**Independent review:** one Important compatibility issue was found: viem 2.47.18 infers EIP712Domain chain ID only for number/bigint, so accepting domain `chainId: "137"` could produce the wrong digest. A regression first failed because this string was accepted; the validator now requires numeric `137` without rewriting the message. The regression and full suite passed after the fix. No other Critical/Important or Minor finding was reported. The reviewer did not rerun a second review; the fix was verified by the failing-then-passing regression and full suite.

The earlier host probes established exact amounts and approximate timing. The subsequent successful permit-plan probe below establishes the full-schema, spender and pinned-nonce read-only gate in both directions through the current server validator. Synthetic tests remain separate evidence.

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

## Host probe stopped at quote — follow-up

The owner supplied `USDC_TO_WETH`, `stage: quote`, HTTP 503 and `quoteAvailable: false`. This means the local quote endpoint failed before `/permit-plan` was called; it does not establish a Permit2 validation failure. The current sandbox cannot reproduce the host request: local fetch returned `TypeError` with cause `EPERM`. The listener on port 3021 was observed in `vezta-dex/apps/api`; its upstream response and loaded configuration remain unknown. No root cause is claimed yet.

The quote endpoint now adds a fixed, allowlisted `code` and, where an HTTP response exists, numeric `upstreamStatus`. The smoke script prints these fields on quote failure while suppressing arbitrary messages, keys and raw payloads. Restart the existing API process before rerunning the same probe; otherwise it will still return the older generic error.

| Code | Where investigation continues |
|---|---|
| `TRADING_API_NOT_CONFIGURED` | The running API has no configured key; check ignored server env loading and restart. |
| `TRADING_API_AUTH_FAILED` | Uniswap returned 401/403; check key access and permissions. |
| `TRADING_API_RATE_LIMITED` | Uniswap returned 429; allow the shared limiter's pause and check other consumers of this key. |
| `TRADING_API_NETWORK_ERROR` / `TRADING_API_TIMEOUT` | Fetch or response-body transport failed; compare the host's direct API probe. |
| `TRADING_API_HTTP_ERROR` | Other upstream HTTP failure; inspect the numeric status. |
| `TRADING_API_INVALID_RESPONSE` / `TRADING_API_SIMULATION_FAILED` | Uniswap response schema or simulation gate failed. |
| `TRADING_API_UNSUPPORTED_ROUTE` / `TRADING_API_INTENT_MISMATCH` / `TRADING_API_INVALID_AMOUNTS` | A route, identity or amount guard rejected the response; investigate without weakening the policy. |
| `TRADING_API_QUOTE_EXPIRED` / `TRADING_API_QUEUE_FULL` / `TRADING_QUOTE_STORE_UNAVAILABLE` | Request lifetime, queue capacity or server quote storage failed. |
| `TRADING_API_UNAVAILABLE` | Unexpected local failure; more targeted diagnosis is required. |

Diagnostic regression tests first failed for missing codes and response-body timeout/network classification. Final full test run: 176 Vitest + 8 Node passed; typecheck, lint, build and smoke syntax passed. Existing React-detection and Next.js workspace-root warnings remain. These synthetic diagnostics do not establish that the owner's 503 is resolved.

## Successful host Permit2 plans supplied by owner

The owner subsequently ran `node scripts/smoke-permit-plan.mjs` on `codex/hook-free-routing` and supplied:

| Direction | HTTP / plan | Polygon block | Observed block time (UTC) |
|---|---|---:|---|
| USDC→WETH | 200 / sign | 94600398 | 2026-09-28T14:28:57.000Z |
| WETH→USDC | 200 / sign | 94600401 | 2026-09-28T14:29:02.000Z |

Both results reported `quoteIdMatches`, `chainMatches`, `quoteFresh`, `hasProvenance`, `domainMatches`, `spenderMatches`, `amountMatches`, `allowanceWindowValid` and `signatureWindowValid` as true, with `leaksRawQuote: false`. Successful `sign` plans mean the current backend additionally accepted the complete canonical types and matched the message nonce to the pinned owner/token/router allowance. The script intentionally prints neither the nonce nor typed data.

This closes the read-only full-message/nonce compatibility gate for these small USDC/WETH probes. The output does not identify the wallet, prove a funded balance, contain a signature, or establish an approval/swap receipt. No transaction was signed or submitted by the probe. The earlier quote 503 did not recur; its specific cause remains unknown because no failure code was captured from that earlier run.

Next work: settle the initial signer/account support boundary, validate signatures against saved messages, consume quotes once, validate Universal Router calldata and simulate before any wallet-write release.
