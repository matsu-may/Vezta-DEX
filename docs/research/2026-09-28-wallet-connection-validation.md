# Read-only wallet connection validation — 2026-09-28

## Scope and fixes

The routed quote panel connects an injected EIP-1193 wallet and reads its current account and Polygon chain before fetching a quote. It does not approve tokens, request signatures, or submit transactions.

Fixed partial chain parsing (`0x89junk` previously passed), stale connection results after account/chain changes, and silent account changes before a quote request. Permission events may arrive before or after `eth_requestAccounts` resolves: matching grant events now work during account/chain verification, while an interrupted prompt cannot reconnect after an account or chain changes away and back. Genuine changes invalidate the displayed quote and require reconnecting.

## Recorded verification

- New regression tests failed before each corresponding fix. The quote panel now has 14 passing tests.
- `pnpm test`: 75 Vitest tests and 3 Node script tests passed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed. Existing lint React-detection and Next.js workspace-root warnings remain.
- Independent DEX review resolved two event-ordering findings; final review found no remaining P1/P2 issues in this slice.
- Chromium checked eight scenarios using a **mock provider and mock quote response**: normal permission grant; amount invalidation; account-event invalidation; silent account change before fetch; malformed chain; chain event during snapshot checks; delayed matching grant; account changes away/back during a pending prompt. All passed, with two mocked quote requests.
- Browser wallet calls were only `eth_requestAccounts`, `eth_accounts`, and `eth_chainId`. No signing or submission occurred. An initial missing-favicon 404 was observed; no application exception was observed.

The browser regression script is `scripts/browser-wallet-check.js`. With the local API/web servers running and `playwright-cli` installed, run it in a fresh automation session:

```bash
playwright-cli -s=vezta-dex-wallet open http://127.0.0.1:3020/swap
playwright-cli -s=vezta-dex-wallet run-code --filename=scripts/browser-wallet-check.js
playwright-cli -s=vezta-dex-wallet close
```

The script injects a fake wallet into that browser session and intercepts routed quotes. Its success does not establish installed-wallet compatibility, live allowance behavior, or executable swaps.

## Next check: installed wallet, read only

Use a normal browser session with an EVM wallet installed, rather than the automation session above. From the repository root, start separate terminals:

```bash
pnpm --filter @vezta-dex/api start
```

```bash
pnpm --filter @vezta-dex/web dev
```

1. Open `http://127.0.0.1:3020/swap`, select Polygon in the wallet, and click **Connect wallet for route**. Accept account access; the quote button should appear after one connection attempt.
2. Request a small quote in each direction, for example 1 USDC or 0.001 WETH. Check the selected tokens, estimated output, minimum output, and timestamp. No approval or transaction prompt should appear.
3. Change amount, token direction, or slippage. The displayed routed quote must clear. Request a new quote, leave it untouched, and verify expiry after approximately 30 seconds.
4. Change the wallet account or network while connected. The quote must clear and the connect button must return. Connecting on another network must show the Polygon message.
5. Reject an account-access prompt and verify the UI remains disconnected and retryable.
6. Record the browser/wallet versions and pass/fail result for each case. Share sanitized error text if a check fails; do not share keys or wallet recovery phrases.

This check needs no token approval or transfer. Exact approval receipts, allowance changes, Permit2 signatures, swap payload simulation, and swap receipts remain separate funded-wallet gates. All wallet writes remain disabled.

## Installed-wallet attempt — 2026-09-29

The next gate was attempted after unsigned swap preparation passed its separate review. No code or wallet transaction behavior was changed for this attempt.

- Chrome is running, but Computer Use refused access with `Computer Use was not approved to use Google Chrome`. No wallet extension was inspected or operated; its identity/version remains unknown.
- No listening processes were observed on ports 3020/3021. Local health/page requests returned unavailable.
- `pnpm --filter @vezta-dex/api start` was blocked by sandbox `listen EPERM` at the tsx IPC pipe. `pnpm --filter @vezta-dex/web dev` was blocked by `listen EPERM` on `127.0.0.1:3020`. Neither server was left running by this attempt. These results do not establish an application or wallet failure.
- The installed-wallet gate remains **pending**, including permission grant/rejection, both live quote directions, expiry and account/network invalidation. Earlier mock-provider checks are not a substitute.

Resume from a normal host Terminal with the two commands above, then open `http://127.0.0.1:3020/swap` in the browser that has the wallet installed. No compiler reinstall or router rebuild is needed for this gate. Record browser/wallet versions and the six checks above. On first handoff, report whether connection succeeds and whether each small quote is available; if a quote fails, provide only the visible error/code. Do not share a full wallet screenshot, signature, API key or recovery phrase. No funded action is required for this read-only gate.

## Owner-reported MetaMask quote — 2026-09-29

The owner supplied an installed MetaMask account (recorded here as `0xf662…D81A`) and the routed quote displayed by the app:

| Field | Reported value |
|---|---|
| Estimated received | `0.037487543240842929 WETH` |
| Minimum received | `0.037300105524638714 WETH` |
| Route | `Uniswap AMM · Polygon · best price` |
| Observed | `2026-09-29T05:00:04.068Z` |

Integer arithmetic confirms that the minimum equals `floor(estimated base units × 9950 / 10000)`, consistent with 50 bps (0.5%) slippage. This is owner-reported connection and one-direction quote-display evidence, not agent-observed browser execution, price comparison or a transaction receipt. It does not establish that this MetaMask account has empty on-chain code.

The input amount was not included. `swap-form.tsx` defaults to `100` USDC, whereas the handoff requested a 1 USDC example; exact input confirmation remains pending before labeling this a 1 USDC smoke result. Do not infer price correctness from output alone. Browser/wallet versions, the reverse direction, invalidation on input/account/network changes, quote expiry and rejection/retry remain pending until reported. Wallet writes remain disabled.
