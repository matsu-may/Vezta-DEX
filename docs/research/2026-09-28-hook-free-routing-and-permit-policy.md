# Hook-free routing and pending Permit2 policy — 2026-09-28

## Owner decision and implementation

The owner selected **option A: Uniswap V2/V3 and V4 pools without hooks**. Both the API and direct quote smoke script now request `hooksOptions: V4_NO_HOOKS` from one shared core policy. There is no fallback to inclusive hooks.

`inspectTradingRoute` checks every branch and hop before storing a quote: supported pool types, valid pool references, Polygon currency identities, matching endpoints and continuous paths. A V4 pool must declare the zero hook address. Missing, malformed or nonzero hooks, unknown pools and missing routes are rejected. Inspection is bounded to 32 branches and 16 hops per branch. Implicit currency conversion edges omitted from metadata are rejected if they break continuity.

The [official quote API](https://developers.uniswap.org/docs/api-reference/aggregator_quote) defines the hook filter. The public [routing-api response producer](https://github.com/Uniswap/routing-api/blob/main/lib/handlers/quote/quote.ts) supplies route branches, `v4-pool` bytes32 references, currency identities and `hooks`. Synthetic tests follow that shape; they are not live pool evidence. This is metadata validation, not verification of contract provenance or executable swap calldata.

## Verification and live limitation

Core/API/server focused tests: 42 passed. Final full suite: 104 Vitest and 8 Node tests passed. Typecheck, lint and build passed; existing React-detection and Next.js workspace-root warnings remain. Independent DEX review found no P1/P2 issues in the route-policy slice. Permit2 diagnostic tests cover exact/unlimited amounts, malformed/expired fields, zero expiration and suppression of raw messages. Review caught the zero-expiration semantics; its regression failed before the fix and final review confirmed resolution.

The revised `node scripts/smoke-trading-api.mjs` was attempted locally. It stopped before an HTTP response with `{"direction":"USDC_TO_WETH","networkError":"TypeError"}`. Current sandbox restrictions do not permit escalation. Neither new live route-policy compatibility nor live Permit2 timing has been verified. Earlier HTTP 200 results used the previous routing request and do not establish this new gate.

## Next read-only evidence

From the owner's networked Terminal, run:

```bash
node scripts/smoke-trading-api.mjs
```

Check both directions for HTTP 200, `CLASSIC`, `hooksOptions: V4_NO_HOOKS`, `routePolicyMatches: true`, matching intent and zero simulation failure reasons. The new `permitDiagnostics` prints only identity booleans, amount category and two remaining time windows in seconds. It never prints the message, signature or nonce. No wallet, private key or transaction is used.

If a route fails inspection, investigate sanitized metadata before changing the guard; do not assume missing metadata means no hook. Installed-wallet checks remain open as described in [wallet connection validation](2026-09-28-wallet-connection-validation.md).

## Decision pending: Permit2 permission lifetime

Three clocks are distinct:

1. **Application quote TTL:** 30 seconds from request start, enforced by Vezta.
2. **`PermitDetails.expiration`:** when Permit2 spender allowance expires.
3. **`sigDeadline`:** the last time the permit signature may be submitted.

The [AllowanceTransfer reference](https://developers.uniswap.org/docs/protocols/permit2/concepts/allowance-transfer) defines the last two separately. The quote API describes the default message path as valid for 30 days; actual returned values still need the diagnostic probe. `permitAmount: EXACT` controls quantity, not these clocks. The selected ERC20 approval remains exactly the input amount under either future duration policy.

The owner must choose whether to accept the standard API allowance lifetime (with exact amounts and explicit validation/display) or require a short allowance lifetime, such as ten minutes. The latter requires verifying whether API-generated typed data and swap preparation support that policy; if not, it changes the signing/preparation adapter. Do not modify typed data and assume the existing API flow will remain compatible.

The diagnostic also reports `expiration=0` as `execution-block`, with unknown effective remaining lifetime before mining. The [canonical Permit2 implementation](https://github.com/Uniswap/permit2/blob/main/src/libraries/Allowance.sol) maps zero to the executing block's timestamp; zero must not be reported as already expired.

No Permit2 signing, swap preparation endpoint or wallet-write control is introduced by this slice. Duration policy is deliberately unresolved until owner review.
