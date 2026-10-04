# Demo wallet header and UI proposals — 2026-10-04

## Implemented scope

Move wallet connection to the top-right header of `/demo/1`–`/demo/4`.
The launchpad's header/chooser pattern and [Uniswap Positions](https://app.uniswap.org/positions)
inform the design; retain Vezta's black surfaces, lime accent and local fonts.

Click **Connect wallet**, then **MetaMask**. Opening the chooser makes no wallet
request. Only selecting MetaMask requests permission. A network switch is a
separate explicit button. Errors stay in the chooser; the full connected address
is available by reopening it. Escape/close restores focus, and the native modal
keeps keyboard focus inside the chooser.

Swap and LP delegate connection to their existing guarded controllers. Their
receipt/recovery records and submission gates remain authoritative. During
original transaction tracking, the header cannot reconnect. Discovery connection
is only a wallet/network read; it does not qualify an account for transactions.
Changing to Swap/LP requires explicit connection through that page's controller.
No session automatically reconnects or prompts after load, reload or navigation.
Only an identified injected MetaMask provider is selected; multiple-wallet
injection uses the MetaMask entry. WalletConnect/other wallet options are not
advertised. No new wallet SDK or transaction API was introduced.

## Proposed next UI pass (not implemented)

1. **Navigation:** use a compact Swap / Explore / Positions top navigation for
   the recording pages, with network and wallet at the right. Move technical
   tools and separate pool detail out of primary navigation.
2. **Swap:** one centered card (roughly 480px), pay/receive fields, visible minimum,
   slippage and fee estimate. Replace repeated status/step blocks with one
   contextual primary action. Keep explicit approval, review and confirmation.
3. **Positions:** list owned positions first, with a clear Create position action.
   Show the action form after choosing create/increase/remove/collect/close,
   rather than displaying all technical controls on initial load.
4. **Explore:** a compact pool list and selected pool detail. Only show supported,
   sourced data; do not add invented testnet USD value, TVL, volume, APR or charts.
5. **Review:** keep authorization, recipient, minimum and complete fee budget easy
   to inspect. Put long addresses, nonce, gas components and block provenance
   under expandable details. Unverified outcomes and original-hash recovery must
   remain explicit and prevent another submission.

These proposals simplify presentation, with the same transaction checks. Public
Vercel hosting still needs the separate [hosting plan](2026-10-04-vercel-readiness.md).

## Owner visual check

Open `/demo/1` and `/demo/2`: header **Connect wallet** → **MetaMask** → connected
address; reopen to inspect the full address. Try closing with Escape and rejecting
one connection. Check Explore/detail also offer the header chooser. A fresh
funded swap/LP lifecycle is unnecessary unless this UI check exposes a regression.

## Verification

- New chooser/controller component checks: **18 tests passed**.
- Final `pnpm test`: **133 Vitest files, 1002 passed /1 skipped; 85 Node tests passed**.
- Mocked browser: **29 swap**, **48 LP wallet**, **12 Explore/detail**,
  and **13 header/keyboard/provider checks passed**.
- `pnpm typecheck`, `pnpm lint` and isolated Next.js production webpack build
  passed. The existing ESLint React autodetection warning remains.
- Independent review findings were fixed and re-reviewed without blockers.
- Screenshots inspected: chooser, connected Swap header, Explore and desktop fit.
  Browser contexts were disposable and did not read or clear owner recovery data.
No real transaction was signed or broadcast during this UI session.
