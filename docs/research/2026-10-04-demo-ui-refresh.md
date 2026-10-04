# Desktop demo UI refresh — 2026-10-04

UI implementation commit: `f604053` on `codex/hook-free-routing`.

## Accepted starting point

The owner reports every existing desktop acceptance step passed: pool reads,
USDC→WETH and WETH→USDC, LP mint/increase/partial and full decrease/collect/burn,
rejection, input changes and original-hash recovery. This records owner-reported
acceptance; new individual NFT IDs and transaction hashes were not supplied.
No wallet transaction was signed or sent by the agent during this UI session.

## Design and implementation

Reference: the existing token-launchpad frontend's global tokens, sidebar,
header and buttons. Keep its black background, `#111` surfaces, lime `#D4FF2B`,
small corners, Space Grotesk and JetBrains Mono. Fonts are self-hosted with their
SIL OFL licenses; builds do not download fonts or add a UI dependency.

The [Uniswap swap](https://app.uniswap.org/swap) and
[Explore](https://app.uniswap.org/explore) interfaces informed token input
hierarchy and compact pool information. The implementation remains Vezta-branded
and uses real testnet values rather than invented prices, volume, TVL or APR.

| Route | Result |
|---|---|
| `/demo/1` | Pay/receive blocks, token identifiers, explicit pair reversal, full-precision output and lime minimum; transaction review and fee budget remain visible. |
| `/demo/2` | Position list and action form in separate columns; bounded authorization/deposit review; explanation of the next step after each token approval. |
| `/demo/3` | Compact pool summary, explicit refresh, qualification/freshness, source and block details. |
| `/demo/4` | Pool overview, sample quotes and contract identity; expired or failed reads never enable action links. |

Shared desktop navigation marks the active route and scrolls in short windows.
Baseline tablet layouts remain usable; complete mobile polish stays deferred.
Transaction buttons retain their existing accessible names. The technical
workspace remains available. Swap reversal invalidates the old quote/review and
resets to the direction's default amount through the existing controller.

## Verification

- The new reversal test first failed for the missing control, then passed.
- `pnpm test`: **132 Vitest files, 993 passed /1 skipped; 85 Node tests passed**.
- `pnpm typecheck` and `pnpm lint`: passed. ESLint retains its existing React
  autodetection warning; no lint errors.
- Isolated production Next.js webpack build: passed with the same source and
  local font assets, without disturbing the owner's active `.next` or servers.
- Disposable mocked browser: swap **26**, LP wallet **48**, Explore/detail **12**
  checks passed; positive/empty/paginated LP reads passed **13** checks.
- All four routes fit 1280px desktop width; the short-window sidebar remains
  reachable (**5** layout checks). Pair reversal also passed **3** browser checks.
- Independently reviewed: no blocking findings; sidebar overflow suggestion
  addressed. Screenshots inspected for all four routes and transaction review.

Browser runs intercept API requests and wallet methods. Their fixture receipts
are regression evidence, not additional public-testnet transactions. Existing
owner storage, API recovery contexts and `next-env.d.ts` were preserved.

## Short owner visual check

With the existing local servers running, open `/demo/1` through `/demo/4`:

1. Check desktop navigation, readable token amounts and the recording layout.
2. On Swap, reverse the pair before sending: the old output/review must clear.
3. On Liquidity, check positions and action controls remain easy to locate;
   minimum deposit, authorization and fee budget are readable during review.
4. On Explore/detail, refresh and check source/status. Report any clipped text
   or confusing label. A complete funded lifecycle repeat is unnecessary unless
   this pass reveals a regression.

## Next boundary

Local desktop functional acceptance is recorded. Public hosting needs the
separate [Vercel readiness plan](2026-10-04-vercel-readiness.md). Complete charged
L1/operator fees, remote CI, hosted acceptance, mobile polish, mainnet, broader
multi-chain execution and main Vezta integration remain separate work.
