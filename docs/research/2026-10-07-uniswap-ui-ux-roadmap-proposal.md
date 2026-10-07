# Vezta DEX — Uniswap UI/UX Roadmap Proposal

**Status:** Approved by owner on 2026-10-07; frontend implementation complete, owner wallet acceptance pending. See [session report](2026-10-07-uniswap-ui-ux-session.md).
**Scope:** Standalone desktop testnet DEX, Base Sepolia and Unichain Sepolia.
**References:** 14 owner screenshots in the original checkout's `docs/reports/uniswap/`; the latest five cover Explore/Pool hover menus, pool detail, full range and custom range.
**Implementation checkout:** `/Users/thongtran/Vezta/.worktrees/vezta-dex-testnet-product`.

## Design direction

Use the screenshot layouts and interactions with Vezta's black/lime palette, Space Grotesk and JetBrains Mono. Header: Swap, Explore, Pool; network and MetaMask connection on the right. Prioritize desktop. Mobile refinement, integration into main Vezta, mainnet execution and deployment remain separate work.

Recommended scope A: expose Tokens, Auctions, Pools and Transactions under Explore; View positions, Create position and Launch auction under Pool. Auction routes explicitly explain that the feature is unsupported. They have no launch, bidding, approval or submission controls. Auction implementation requires a later feature specification. The owner approved this scope on 2026-10-07.

## Data and behavior boundaries

- Token selection uses each chain's supported registry. Browsable pools are not automatically executable pools: retain execution qualification and explain unavailable actions.
- Transactions shows activity recorded in this browser, filtered by wallet and chain, with last observed status. It is not a global or complete on-chain feed.
- Show balances, token amounts, verified quote samples, range bounds, fees and provenance only when their sources provide them. Do not invent USD prices, TVL, volume, APR or historical chart data.
- A range diagram represents selected bounds and an observed current pool price; it is not a historical price chart or a liquidity distribution. If current price is unavailable, show bounds without a current marker.
- Retain exact approvals/reset policy, simulations, expiry, chain/account checks, fee estimates, two-L2-block inclusion policy and original-hash recovery. Unichain stays EOA-only; Base retains its qualified wallet policy.
- Preserve active recovery storage and existing recovery URLs. Reading history never resends a transaction or equates an explorer success with verified application execution.

## Implemented routes

All new product paths are under `/networks/{network}`; supported network slugs are `base-sepolia` and `unichain-sepolia`.

| Path | Purpose |
|---|---|
| `/swap` | Swap form, review and original transaction result |
| `/explore/tokens` | Supported token list and search |
| `/explore/auctions` | Unsupported-feature explanation |
| `/explore/pools` | Pool catalog and filters |
| `/explore/transactions` | Wallet-scoped local activity |
| `/pools/{poolId}` | Curated pool detail |
| `/positions` | Position list and empty state |
| `/positions/create` | Choose pool, configure range/deposit, review |
| `/positions/{tokenId}` | Validated owned-position detail and action forms |
| `/liquidity/launch-auction` | Unsupported-feature explanation |

Reject unknown networks, pool IDs and invalid NFT IDs. Distinguish a position not yet scanned from a verified missing position. Chain switching preserves a compatible view; a pool/NFT detail that has no identity on the destination chain returns to its catalog rather than copying the ID. Existing `/networks/{network}/{explore,pools,pool,positions,swap}` and `/demo/1..4` remain usable while compatibility and recovery links are migrated explicitly.

## Ordered delivery

### 1. Freeze the UI contract and route foundation

- Map the 14 references to screens and document supported/unsupported data.
- Add validated route parsing/building; adapt network selection for nested routes.
- Establish shared wallet/workspace behavior across navigation. Never automatically request connection, approval or send on route load.
- Preserve pending recovery across deep links, Back/Forward and reload. Keep network switching blocked until active records are resolved.
- **Acceptance:** Every proposed route has a defined identity, empty/error state and safe navigation destination.

### 2. Shared header and visual primitives

- Implement the exact menu hierarchy from the two hover screenshots.
- Support hover, click, keyboard focus, Escape, outside click and focus restoration without a pointer gap between trigger and menu.
- Build consistent token/network badges, tables, buttons, panels, tabs and status components. Use official local MetaMask artwork already present.
- Move technical/demo navigation into a secondary destination so product navigation stays concise.
- **Acceptance:** All desktop pages share the header; menus remain usable while moving the pointer into an item, and connection/recovery state remains accurate.

### 3. Swap presentation

- Center the Sell/Buy card; supported token picker, reverse-pair button, balance and slippage settings.
- Adapt the existing state machine into explicit Quote, Approve when required, Review, Submit and Result UI. Show one appropriate primary action.
- Keep reviewed minimum, authorization amount, spender/network and fee budget visible. Expandable provenance contains lower-level fields.
- Show rejected, expired, blocked, pending, confirmed and unverified states distinctly. Offer original-hash recovery without resubmission.
- **Acceptance:** Both token directions and approval/reset paths retain the same economic constraints and recovery behavior.

### 4. Explore, pool detail and activity

- Build the four Explore tabs and supported token/pool tables with real filters.
- Pool detail uses the screenshot's breadcrumb, pair/network/fee header, main content and sidebar with Swap/Create position and address links.
- Use verified samples and available pool state instead of fabricated historical charts or USD statistics. Unsupported metrics have an explicit unavailable state.
- Activity includes action, amount when recorded, status, observed time and explorer hash; filter by connected wallet, chain and action.
- **Acceptance:** Changing chain updates token/pool identities, links and activity scope; empty and unavailable states never appear as verified zero values.

### 5. Create-position wizard

- Step 1 selects a supported execution pool. Browsable unsupported pools explain why creation is unavailable.
- Step 2 places pool identity on the left, range/deposit controls on the right, following the new full/custom screenshots.
- Full/custom segmented selection, min/max inputs and actual snapped bounds reuse existing exact range math. Full range is labelled as the protocol's usable range, not mathematically infinite ticks.
- Use a labelled range diagram. Do not add historical timeframe controls without historical data.
- Deposit cards show wallet balance, authorization caps and planned amounts separately. Preserve current permitted cap values; arbitrary amounts or automatic counterpart calculation require a separate validated change.
- Step 3 reviews the existing server study. Show approval/reset progress by token, followed by mint; each remains a separate reviewed wallet transaction.
- **Acceptance:** Invalid ranges, single-sided deposits, insufficient balances, stale reviews and unused allowance are explained correctly; displayed controls cannot bypass server policy.

### 6. Position detail and lifecycle actions

- Position list includes NFT ID, pair, range status, current principal and estimated collectable; queried owner and connected signer stay distinct.
- Detail presents range, principal, new fees and mixed stored owed with the appropriate ownership/stale-data gates.
- Add separate Add liquidity, Remove liquidity, Collect and Close forms over the existing controller. Increase retains the NFT range; decrease preserves existing supported percentages.
- Explain that decrease adds owed tokens, collect transfers them, and close requires an empty NFT. Refresh scans after verified mutations.
- **Acceptance:** Mint/increase/decrease/collect/burn, historical scan indicators and original LP recovery remain functional after route separation.

### 7. Focused verification and handoff

- During implementation run only tests for changed routing, presentation and state bindings. Use deterministic browser fixtures for visual and interaction coverage; label them mock-only.
- Cover hover/keyboard navigation, nested network switching, identity validation, account changes, expiry, rejection and reload recovery. Check desktop at 1280, 1440 and 1920 pixels.
- Run one full regression suite, typecheck, lint and build at the final checkpoint. Repeat only to resolve a concrete failure.
- Reuse qualified compiler/fork evidence when transaction preparation logic is unchanged; rerun a relevant fork only if an actual execution-path change requires it.
- Provide before/after screenshots, a changed-route map and one consolidated owner acceptance checklist. No automatic signing, public broadcasts, merging or deployment.
- **Acceptance:** UI verification passes, known data limitations are visible and remaining public-wallet acceptance is explicitly listed rather than marked complete by mocks.

## Expected code areas

- Routes and shared composition: `apps/web/app/layout.tsx`, `apps/web/app/networks/`, `apps/web/components/demo-wallet-workspace.tsx`.
- Header and navigation: `demo-navigation.tsx`, `demo-wallet-header.tsx`, `testnet-network-selector.tsx`, `lib/testnet-network-selection.ts` and new focused route helpers.
- Swap: `demo-swap-inputs.tsx`, `demo-swap-actions.tsx`, `testnet-wallet-panel.tsx`, review/recovery components.
- Discovery/activity: `testnet-chain-explore.tsx`, `testnet-activity.tsx`, existing pool readers and activity storage.
- Positions: split presentation from `testnet-lp-wallet-panel.tsx` and `testnet-lp-panel.tsx`; reuse `testnet-lp-range-fields.tsx` and existing controller contracts.
- Styling: `apps/web/app/globals.css` and focused new presentation components. Backend additions, if needed for an already-read current pool state, are minimal validated read-only fields; historical indexing is excluded.

## Later expansion

Global transaction indexing, historical price/volume/depth charts, reliable TVL/APR analytics, arbitrary token/pool execution, auction creation/bidding, new protocol support and mobile refinement need separate scope approval. Additional owner screenshots can refine the visual design without reopening qualified financial behavior.

## Official supporting references

- [Uniswap v3 liquidity modification](https://developers.uniswap.org/docs/sdks/v3/guides/managing-liquidity/modifying-position)
- [Concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity)

These clarify protocol behavior for screens not captured by the owner; the owner screenshots remain the visual reference.
