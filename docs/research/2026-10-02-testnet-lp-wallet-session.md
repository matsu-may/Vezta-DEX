# Testnet LP wallet and assembled desktop session

Independent implementation, scoped review and final local integration qualification are complete. Public installed-wallet acceptance remains owner-operated. This checkpoint distinguishes implemented code from passed gates. Authority: [design](../superpowers/specs/2026-10-02-testnet-lp-wallet-design.md) and [implementation plan](../superpowers/plans/2026-10-02-testnet-lp-wallet.md). Previous LP foundation at commit `4ad859d` remains qualified independently.

## Choices

- Continue two independent groups: LP wallet operations and assembled desktop routes. Public signatures/acceptance remain owner-operated.
- Separate resets, approvals, deposits, removals, collections and NFT burn into individually reviewed wallet transactions; never send automatically.
- Keep swap's 30s quotes; use LP's 120s bound to accommodate multi-token reads and review. Fresh simulation and immutable recheck still gate every LP wallet prompt.
- Use exact user-selected LP input caps for approvals and independently bounded SDK desired deposits. Price movement between token approvals cannot turn the workflow into repeated desired-amount resets. Show remaining authorization separately; burning an NFT does not revoke token allowances.
- Share the origin Web Lock and reciprocal active-recovery guards. A corrupt/pending LP slot blocks a new swap, and vice versa; existing original hash checks remain available.
- Persist bounded LP action contexts in ignored local files for development restart recovery. This is a single-process local demo, not production shared storage.
- Use recording routes 1 Swap, 2 Liquidity, 3 Explore, 4 Pool detail, with Base Sepolia labels and launchpad desktop styling. Do not manufacture TVL/APR from raw pool liquidity.
- Pin Next/Turbopack and standalone tracing to `vezta-dex`, avoiding the parent workspace root inferred from unrelated lockfiles.
- Trust the pinned server SDK for canonical LP minima; independently bind browser/core descriptors to calldata and preserve the reviewed envelope. Do not duplicate SDK math in the browser or claim independent canonical math verification there.
- Limit Vitest to one worker to reduce competing subprocesses. Preserve all existing test and service timeout bounds; an overloaded host does not justify relaxing transaction checks.

## Protocol reference

The existing Uniswap v3 position manager may emit nominal collected amounts slightly larger than actual pool transfers due to rounding. Receipt checks distinguish the two and use actual pool payments/ERC20 transfers for wallet output. See [official NonfungiblePositionManager](https://github.com/Uniswap/v3-periphery/blob/main/contracts/NonfungiblePositionManager.sol).

## Implemented scope

- Strict LP studies, exact cap/reset approvals, immutable recheck, complete buffered fees and persisted original contexts.
- Mint, increase, partial/full decrease, collect and burn receipt checks; ownership, NFT progression, canonical blocks, actual pool payments and original transaction identity.
- Explicit MetaMask controller, reciprocal swap/LP recovery guards, API restart recovery and safe acknowledgment. No automatic send or retry.
- Desktop Explore/detail/navigation and LP wallet controls. Confirmed manager actions mark old scans historical until manual refresh. Reverted approvals never claim granted authorization.
- A disposable Anvil harness qualifies the new public-consumer study/recheck/receipt APIs locally, including store restart recovery and final cleanup.

## Verification evidence and remaining gates

- Final serial Vitest: **117 files passed; 857 tests passed, one skipped** (466.76s). Final Node scripts: **85 passed, zero failed**, run with one test process at a time.
- Full `pnpm typecheck` and `pnpm lint`: observed exit 0; API typecheck and scoped lint also passed after adding the CLI-only diagnostic wrapper. `pnpm build`: observed exit 0 before and after pinning the standalone workspace root. The owner's `apps/web/next-env.d.ts` edit was restored after each build.
- Production-build browser with mocked API/wallet: **30 LP wallet checks / 41 intercepted calls** and **12 Explore/detail checks / five intercepted reads** passed. Only the script origin was changed to a disposable port 3030 copy; the repository scripts keep port 3020. The recording routes and screenshots were inspected. The owned browser and temporary preview server were stopped.
- The production Explore error check first exposed two `alert` elements (application error and Next route announcer). Its selector was narrowed to the pool error; the same script then passed. No product error was suppressed.
- Fresh final reviewer found two UI issues (historical scan and reverted authorization); both fixes passed scoped code re-review with no remaining findings. Final serial tests also cover both regressions on the final React-state implementation.
- Earlier overloaded default/two-worker test and dev-browser attempts failed with unchanged timeout limits. These failures were not counted as passes. Serial execution and the production preview subsequently qualified the above gates; no owner application/process was stopped and no transaction timeout was relaxed.
- New LP wallet consumer fork **passed at block 47594852**: reset/exact cap approvals, mint (local NFT 82526), increase, 50% decrease, full decrease, actual collect and burn all passed real study/recheck/simulation/original receipt verification. Restart recovery preserved the original hash; final NFT absence and cleared allowances were verified. Snapshot reverted and owned Anvil stopped; owner funds were never used. NFT 82526 exists only in this disposable fixture, not as a claimed public mint.
- Before that successful run, one overloaded fork timed out and another stopped at mint with a sanitized RPC-unavailable error. The diagnostic run completed without a source failure. A CLI-only wrapper now reports only failed method/category metadata, never RPC URLs or request contents. Transaction/service bounds were not relaxed.
- No public MetaMask receipt, real charged L1/operator fee or remote CI result is claimed here. No public transaction was sent.

## Efficient handoff

1. Use the owner guide for public MetaMask acceptance; avoid repeating unchanged source/compiler, historical RPC or now-qualified local gates.
2. If an owner action fails, preserve its original hash/context and report the safe error/status. Reproduce and test only the affected flow before rerunning broader gates.
3. Remote CI, public hosting, mobile polish, mainnet and main Vezta integration remain separate milestones. This local demo uses one process and one executable testnet adapter.

## Owner boundary

Use the [desktop owner guide](2026-10-02-testnet-desktop-owner-guide.md) after final independent qualification. Complete both public swap directions and mint → increase → partial/full decrease → collect → close with a standard MetaMask account. Report only sanitized hashes/NFT/status/amounts, never credentials or private recovery contents. Remote CI, public wallet compatibility and actual charged L1/operator fees remain separate gates.
