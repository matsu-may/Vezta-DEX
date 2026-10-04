# Compact demo UI — 2026-10-04

## Scope and decisions

The owner confirmed header wallet connection works and approved the compact UI
proposals. This pass updates the standalone desktop recording routes. Vezta's
black surfaces, lime accent and local fonts remain the visual basis.

- Header navigation: **Swap / Explore / Positions**, with network and wallet on
  the right. Pool detail belongs under Explore; technical tools are in the footer.
- `/demo/1`: centered 480px swap card, pay/receive fields, visible minimum and
  slippage, and one contextual primary action. Quote, review and submission remain
  separate operations. Required approval leads to its own review and submission.
  Manual allowance checks remain under **More review options**. An expired review
  requests a new quote instead of offering submit.
- `/demo/2`: positions first; **Create position** or a row action opens a side form.
  **Back to positions** discards an unsent study. Original transaction recovery
  remains visible after reload, even when no form was selected. Initialization
  errors remain visible independently of the form.
- `/demo/3`: compact supported-pool table; `/demo/4`: detail and quote samples.
  Provenance is expandable. Unavailable USD TVL/APR are explicit, never invented.

Keep recipient/target, approval amount, minimum and complete snapshot budget
visible during review. Expand nonce, gas components and block details. Transaction
controllers, exact authorization policy and API contracts were not changed.

## Official MetaMask asset

Use the unchanged fox SVG from the [official MetaMask asset pack](https://metamask.io/assets),
stored locally at `apps/web/public/wallets/metamask.svg`. Download/member/hash
provenance is in that directory's README. The chooser remains accessible through
the visible MetaMask name; the image is decorative. No new wallet SDK is needed.

## Verification

Mock browser checks cover swap, exact approvals, the LP lifecycle, expiry,
rejection, original-hash recovery, owner reads, discovery and keyboard navigation.
Screenshots inspected include the official fox chooser, quoted Swap, Positions,
Explore/detail and the 1280px header. Tests use disposable browser storage and
intercept API/wallet requests; no real signature or broadcast occurs.

Independent review found an LP startup notice hidden by the closed form. A failing
regression test reproduced it; the notice now renders outside the form. Existing
wallet/recovery gates remain intact. Follow-up review found no remaining blockers.

- Final `pnpm test`: **134 Vitest files; 1008 passed / 1 skipped**;
  **85 Node tests passed**.
- `pnpm typecheck`, `pnpm lint` and isolated Next.js production webpack build
  passed. The existing ESLint React autodetection warning remains.
- Mock browser: **30 swap**, **48 LP wallet**, **13 LP ownership**,
  **12 Explore/detail**, **13 chooser/keyboard/provider checks passed**.
- Build ran in an ignored copy to preserve the owner's active development server.
  The pre-existing `next-env.d.ts` owner change is excluded from this commit.

## Owner check and next milestone

Reload `/demo/1`–`/demo/4` with the current server. Check the fox in the header
popup, contextual Swap buttons, the Positions Create/Back flow, and expandable
source/fee details. A full funded lifecycle already passed owner acceptance;
repeat it only if this visual check exposes a regression.

Public Vercel hosting still needs the separate
[hosting plan](2026-10-04-vercel-readiness.md). Full mobile polish and main Vezta
integration are later milestones.
