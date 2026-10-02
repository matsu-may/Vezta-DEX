# Base Sepolia LP — independent implementation checkpoint

## Scope and choices

Owner authorized continued independent LP work while unavailable for testing. Keep the standalone DEX and desktop recording routes; no main Vezta integration, mainnet or mobile completion. Use the existing qualified Uniswap v3 USDC/WETH 0.3% pool and NFT manager on chain 84532. `/demo/1` stays swap; `/demo/2` is the new LP recording workspace.

Pin `@uniswap/sdk-core@7.19.4` and `@uniswap/v3-sdk@3.31.5` in the API only. No protocol clone or new contract. Node 24 cannot consume the SDK package's advertised import branch as used here, so a server-only adapter selects its documented CommonJS exports. A subprocess test now checks the actual Node/tsx runtime, beyond Vitest's bundler.

## Implemented

1. Pinned, runtime-verified LP reads: owner NFT enumeration, correct pool/token/fee filtering, range/state, current token principal, new fees since checkpoint, stored owed and estimated collectable. All data is read at one block, including subsequent pages. One NFT per page by default, maximum five; 120-second scan lifetime; 25-second operation budget; shared RPC pacing. Busy/error/empty/partial/stale states are distinct.
2. Internal unsigned SDK planner: mint, increase, decrease, collect and burn; fixed 50 bps **pool-price** slippage, bounded token caps, range spacing/order, manager target, exact approval/reset plans, owner recipient and zero native value. SDK decrease+collect calldata is deliberately separated into an explicit decrease call. Planner is not a public execution API and does not yet include a public wallet LP action controller or receipt context.
3. Disposable fork lifecycle: exact approvals, mint, increase, partial/full decrease, collect, clear allowances and burn; simulation, receipt envelope, NFT identity, liquidity and balance checks. It reuses qualified deployment pins and guarded loopback-only Anvil writes. Snapshot cleanup stops only the child it created.
4. `/demo/2`: launchpad black/lime desktop style, manual owner-address reads, pinned-page scanning, explanatory amount labels, errors and provenance. Public LP action buttons stay disabled. Browser fixture data is used only by intercepted tests; application data comes from RPC.

## Amount semantics

Current principal is computed from current liquidity and pool price with SDK integer math. It excludes collectable tokens. New checkpoint fees use v3 fee-growth-inside arithmetic with uint256 wraparound. Stored owed can contain fees and withdrawn principal, so the UI never calls it profit. Estimated collectable sums both and may differ from actual payment by rounding dust.

Fresh review found that the manager's Collect event can report nominal owed while the pool transfers slightly less. The fork check now compares the pool's Collect event with actual wallet balance deltas, checks nominal bounds, and reports the difference explicitly. It does not infer real charged L1/operator fees from Anvil.

Official references checked:

- [SDK PositionManager](https://github.com/Uniswap/sdks/blob/main/sdks/v3-sdk/src/nonfungiblePositionManager.ts)
- [Tick fee-growth arithmetic](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/Tick.sol)
- [Position fee checkpoints](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/Position.sol)
- [Manager collection and rounding](https://github.com/Uniswap/v3-periphery/blob/main/contracts/NonfungiblePositionManager.sol)

## Verification ledger

- Initial SDK ESM failure reproduced in real Node; corrected CommonJS adapter loads both reader and planner.
- First Base Sepolia fork at block **47586901** completed the full lifecycle, verified balances/NFTs, reverted snapshot and stopped child. No owner funds used; public execution and actual total-fee qualification remain false.
- After review's rounding fix: the full lifecycle passed at block **47587031**. Pool payment, manager nominal amounts and wallet deltas matched; this sample had zero rounding dust. A separate regression proves nonzero dust is accounted without claiming extra tokens were received. Snapshot reverted and owned child stopped.
- Browser: **13 mock-only checks**, 7 intercepted LP API calls. No wallet methods invoked. Covers empty vs unavailable, pinned pagination, late responses after owner edit, expired scan, disabled public writes and distinct amount labels. Desktop screenshot inspected.
- Live API read for the existing smoke address: HTTP **200**, **10488 ms**, chain 84532, zero owned positions, runtime verified, execution disabled. Zero NFT ownership is a valid outcome, not a provider failure.
- Final local gates: **106 Vitest files; 800 tests passed, 1 opt-in integration test skipped; 85 Node script tests passed**. Typecheck, lint and build passed; `/demo/2` and its fixed proxy are present in the build. Existing React lint auto-detect and Next workspace-root warnings remain nonblocking. Unrelated owner `apps/web/next-env.d.ts` was preserved exactly; no push/merge/deploy.

## Owner checks when available

1. From `vezta-dex`, run `pnpm dev` for LP reads. If a server already occupies 3020/3021, stop/restart it in the terminal that owns it; do not run two copies. For swap signatures later use `pnpm dev:testnet` instead.
2. Open `http://127.0.0.1:3020/demo/2`. Confirm Base Sepolia badge, launchpad style, Swap/Liquidity links and no MetaMask prompt on load.
3. Enter a valid wallet address and press **Read LP positions**. With no NFT, **No positions owned** is expected. USDC/ETH balances are not required for this read. A 503 must show unavailable, never empty ownership.
4. With a matching USDC/WETH 0.3% NFT later, compare NFT ID/range/owner with Base Sepolia explorer. Principal, checkpoint fees and stored owed must remain separate; stored owed/estimated collectable is not profit. Other pools are skipped and partial scans show **Scan next NFT**.
5. Optional reproducible local lifecycle: `pnpm testnet:lp-fork`. It creates disposable Anvil and does not send public transactions; no faucet balance or private key is needed. No need to repeat this if the recorded gate is unchanged.
6. `/demo/1` standard-account public swap acceptance remains open from the previous session. The archived EIP-7702 approval must remain unverified; do not delete history to bypass recovery.

## Remaining roadmap

LP phase 4 is **partially complete**, not public-wallet complete. Next independent work: LP wallet-state/funding/gas-budget studies; bound fresh action contexts and final rechecks; wallet signing state machine, original-hash persistence/recovery and canonical NFT/ERC20 receipt verification; then mock/fork checks. Owner acceptance comes afterward: public testnet mint/increase/decrease/collect/close with their own standard-account wallet and test tokens. Assemble Explore/pool-detail/navigation and final desktop handoff after those gates. Mobile, mainnet and main Vezta integration remain later work.
