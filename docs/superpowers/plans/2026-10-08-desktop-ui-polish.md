# Desktop UI Polish Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this approved audit inline. Keep progress here; preserve pre-existing staged organization changes.

**Goal:** Make existing desktop DEX controls, reviews and page layouts coherent with the supplied Uniswap references and Vezta colors.
**Architecture:** Presentation changes stay in web feature components and shared UI. Network selection continues routing the workspace; wallet switching remains explicit. Controllers, transaction schemas and backend are unchanged.
**Tech Stack:** Next.js, React, TypeScript, CSS, Vitest, Playwright CLI.
**Spec:** `docs/reports/2026-10-08-desktop-ui-audit.md` (approved by the user's next message).

## Global Constraints

- Keep Base Sepolia 84532 and Unichain Sepolia 1301 identities and existing supported assets/actions.
- Preserve original-context recovery locks, review invalidation, exact approvals, simulation, expiry and execution gates.
- Preserve owner files, screenshots and staged source organization. No push/deploy in this task.
- Desktop 1440/1280/1024 px; mobile completion remains deferred. No new dependencies or invented financial metrics.
- Run focused behavior checks during implementation; full quality gates once at the end. Wallet/API state uses mocks for browser verification.

## Review Focus

- Pending recovery must block both dropdown selection and wallet prompts.
- Workspace changes must never prompt MetaMask or imply the wallet changed chains.
- Expiry/error text and CTA must remain separate when review content scrolls.
- A queried NFT owner is not the connected signer; read-only detail access remains available.
- Invalid custom bounds and changed input must keep existing review invalidation.

## Tasks

### 1. Shared header and dialogs

Files: `components/layout/testnet-network-selector.tsx`, `demo-navigation.tsx`; `components/ui/product-dialog.tsx`, `product-token-picker.tsx`, new `product-icon.tsx`; wallet header; product CSS.
Interfaces: retain network routing helpers and wallet binding API. Add optional `footer: ReactNode` to ProductDialog; expose `useProductWalletNetwork()` for presentation.
- [x] Add tests for accessible network popover, Escape/focus, recovery lock and active alias routes; see failing result.
- [x] Implement SVG icons, aligned controls, supported-chain popover, wallet chain status and shared dialog footer.
- [x] Run targeted tests, preserve wallet prompt boundaries.

### 2. Swap and review

Files: swap inputs/panel/review; shared dialog/footer CSS.
Interfaces: use existing amounts/controller callbacks; no rounding to canonical transaction values.
- [x] Make cards symmetric, show wallet CTA without provider, compact quote/provenance and settings.
- [x] Move expiry + submit into dialog footer; retain disabled gates and full financial details.
- [x] Run affected wallet/input regression tests.

### 3. Explore and Pool

Files: product-explore/pool-detail/testnet-chain-explore; product CSS.
Interfaces: retain catalog identities, sample refresh and links.
- [x] Align descriptive/numeric columns, normalize search/toolbar and LP support badges.
- [x] Reduce repeated pool headings and unavailable-data prose; preserve sample vs wallet distinction.
- [x] Run existing catalog/sample regression tests.

### 4. Positions and Create

Files: LP panel/create/range-fields/wallet-panel; product CSS.
Interfaces: retain owner read, action selection, caps, range parser, economic labels and acknowledgment.
- [x] Separate compact list summary and detail hierarchy; compact owner toolbar.
- [x] Order controls as Full/Custom → bounds → diagram → caps → review. Move LP submit/expiry to dialog footer.
- [x] Run LP presentation and lifecycle controller regression tests.

### 5. Verification and handoff

- [x] Browser screenshots and keyboard checks; mock quote/review/LP data, no real wallet send.
- [x] Tests/typecheck/lint/build once; read results and fix concrete failures only.
- [x] Fresh read-only review of changed UI files, then targeted fixes if necessary.
- [x] Report completed changes, choices and owner checks; retain working changes for review.

## Execution notes

Ruling: implement in existing `codex/repository-organization` checkout; a fresh worktree would omit the staged source moves that this UI consumes. Keep UI edits unstaged and do not commit the combined owner work.
Ruling: scoped product stylesheet follows existing global CSS; remove overridden product declarations when consolidating. Historical UI remains intact.
Ruling: no new wallet add-chain flow or automatic network prompt. Show app/wallet network separately and reuse the existing explicit wallet switch.

## Completion evidence

See `docs/reports/2026-10-08-desktop-ui-polish.md` for results, screenshots and owner checks.
Ruling: do not rerun the complete Vitest suite after correcting one new assertion's expected text; rerun its 11-test suite and the 85 script tests. All other 1,170 Vitest tests already passed in this session.
Ruling: browser verification uses a temporary source-only preview on port 3120, without owner env files or shared `.next` state. Keep the existing web/API processes running.
Review finding resolved: account changes preserve the known chain; chain changes update it and disconnect clears it.
