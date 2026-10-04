# Base Sepolia quote review timing

## Approved decision

The owner selected option A: newly issued wallet swap quotes last 120 seconds from their original block timestamp. Quotes without the strict `quoteTtlSeconds: 120` marker retain the legacy 30-second deadline. This affects the standalone testnet demo; Polygon and LP policies are unchanged.

The shared expiry calculation binds server storage, studies, action contexts, browser validation/countdown, diagnostics and router calldata. Changing a marker cannot validate old calldata or extend a saved recovery record. Quotes are consumed once.

## Cause and measured result

The original quote → allowance-ready → swap review sequence took 31,281 ms against the local API and failed with `TESTNET_QUOTE_UNAVAILABLE`, exceeding the original 30-second window. Approval-ready did not consume the quote.

After the change, the same read-only sequence returned HTTP 200 at every stage: quote 11,419 ms, approval review 7,045 ms, swap review 16,042 ms. Total elapsed time was 34,507 ms with 85,621 ms remaining on the original quote. Runtime verification and original minimum output passed. This prepared an unsigned context; it did not sign or broadcast.

## Freshness and compatibility

Quote acquisition still requires a fresh block. Simulation and fee studies retain their independent 30-second freshness limit. Browser submit checks that limit before wallet checks and immediately before the wallet call, including after recovery storage writes. Fork submission enforces it after reads and at the final send boundary.

New contexts preserve the study timestamp. Existing contexts recover using their original timestamps/deadlines; legacy fork records use their original quote timestamp conservatively. Tracking retains its separate 24-hour lifetime.

## Verification

- RED tests witnessed the original expiry, stale-study and final storage-boundary failures before their fixes.
- `pnpm test`: 129 Vitest files, 969 passed and one skipped; 85 Node tests passed.
- `pnpm typecheck`, `pnpm lint`: passed; lint retains the existing React detection warning.
- Isolated `pnpm exec next build --webpack`: passed, preserving the owner's active dev outputs.
- Playwright disposable profiles: 26 legacy scenarios and four new timing checks passed. All wallet/API interactions were mocked.
- Independent review: no remaining blocking findings. No runtime rebuild or public fork lifecycle was repeated for this bounded fix.

## Owner acceptance remaining

Follow the updated [desktop owner guide](2026-10-02-testnet-desktop-owner-guide.md#quote-and-review-timing-updated-2026-10-04), starting at 3C. Request a new quote, review swap if allowance is ready, confirm the reviewed operation and verify its original hash/output. Public MetaMask swaps and LP acceptance remain pending; local evidence does not mark the complete demo accepted.
