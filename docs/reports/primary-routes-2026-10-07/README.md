# Primary DEX routes — 2026-10-07

## Route map

| Page | Primary URL |
|---|---|
| Home / swap | `/` → `/swap` |
| Explore | `/explore`, `/explore/tokens`, `/explore/pools`, `/explore/transactions`, `/explore/auctions` |
| Pools and detail | `/pools`, `/pools/{supported-address}` |
| Positions | `/positions`, `/positions/create`, `/positions/{NFT-ID}` |
| Auction notice | `/liquidity/launch-auction` |

Base Sepolia is the default. Append `?network=unichain-sepolia` for Unichain. Pool swap links preserve fee/address alongside network; position links preserve the queried owner. Unknown/duplicate network values and wrong-chain pool IDs fail closed. Network switches drop pool/NFT/owner/quote selections. Original pending records retain chain-specific recovery links and block switching.

Existing `/networks/{base-sepolia,unichain-sepolia}/...` pages remain available. Polygon research pages moved to `/polygon/{swap,explore,pools,positions}` with pool details under `/polygon/pools/{pool-ID}`. Demo/rehearsal/API routes and transaction controllers remain intact.

## Evidence

- Focused route/navigation tests first failed, then passed: 4 files / 11 tests.
- Workspace typecheck passed.
- Mock browser walked primary swap, menus, wallet chooser, token picker, Explore tabs, pool/detail, full/custom range and NFT detail. Root Unichain switching, pool-link query preservation, old alias, malformed pending-record lock and original-chain recovery link passed.
- Mock LP approval review → submit → verified receipt → acknowledge passed on `/positions/create`.
- Initial browser harness encountered its sandbox's unavailable global `URL`; URL parsing moved into the page context and only the remaining link/recovery checks were rerun.
- A screenshot tool injected `caret-color: transparent` before hydration on one search input, producing a tooling-related hydration advisory. No application exception was observed.
- Captures use fixtures; they do not prove public-chain execution. No real wallet signature or broadcast was performed.

## Owner check

Run `pnpm dev:testnet` from the original `vezta-dex` checkout. Open `/swap`; verify header Connect, Explore/Pool menus and review modal. Browse `/explore/pools`, open a detail and use its Swap link. Open `/positions/create`. Switch to Unichain and confirm `network=unichain-sepolia` remains on subsequent links; confirm a Base pool address cannot open as an Unichain pool. Existing `/networks/...` bookmarks still work.

## Final verification and handoff

- `pnpm test`: 180 files, 1,165 Vitest tests passed / 1 skipped; 85 Node script tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Existing ESLint React autodetection advisory remains.
- One independent review found no Critical/Important issues in route identity, query preservation, wallet session continuity, recovery or Polygon compatibility.
- Changes are integrated locally into `main` and pushed using normal fast-forward Git operations; owner tracked edits and untracked screenshots are retained. No API/core/controller changes or new dependencies in this change.

