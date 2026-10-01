# Uniswap Dependency and Adapter Follow-up Plan

**Status:** Direction accepted by the owner. Stage 1 package acquisition and offline artifact/ABI checks are implemented; runtime/source qualification and later stages remain open. See [artifact progress](../../research/2026-10-01-testnet-artifact-progress.md).

**Delivery map:** the [consolidated testnet completion roadmap](2026-10-01-standalone-testnet-completion.md) places these dependency/adapter tasks within the complete six-phase demo sequence and records owner acceptance gates.

**Stage 1 update, 2026-10-02:** router-only independent compilation has passed against the historical Base Sepolia snapshot. Every runtime byte and all 23 immutable slots matched; the new `testnet:router-rebuild` command recomputes this proof. Other role rebuilds and fresh dependency qualification remain open; QuoterV2 source acquisition currently needs the owner's working network. See [the scoped proof and next action](../../research/2026-10-02-testnet-router-rebuild.md).

**Goal:** Complete the standalone Base Sepolia demo using official Uniswap dependencies where they reduce maintenance, while preserving independently validated transaction policy.

**Architecture:** Retain `apps/web`, `apps/api` and `packages/core`. Use deployed Uniswap contracts, server-side RPC reads and wallet-owned signatures. Keep each adapter's chain, router version, approval spender, quote and receipt rules explicit.

**Tech stack:** Existing TypeScript/viem/Zod/Vitest. Add pinned official artifacts and SDKs only after compatibility checks. Source dependencies are optional for verification or contract tests.

## Current evidence and constraints

- Base Sepolia chain 84532, canonical test USDC/WETH, v3 fee 3000 pool `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad`.
- Owner confirmed live depth through API/web and matching preview/minimum in both directions. These historical observations are not fresh execution quotes.
- [Unsigned foundation](2026-10-01-testnet-swap-calldata.md) is implemented: separate SwapRouter02, bounded amounts, 50-bps minimum, original 30-second deadline and exact/reset approvals. No testnet API/web execution consumer exists yet.
- Hosted Base Sepolia quotes previously returned `404 UpstreamTimeoutError`; documented chain support does not prove operational routing. Keep the API probe optional.
- Keep this project independent from main Vezta. Follow token-launchpad desktop UI when UI work resumes; mobile polish remains deferred.

## Selected approach and alternatives

| Approach | Decision | Reason / reconsideration trigger |
|---|---|---|
| viem + official ABI/artifact + direct RPC | First choice for the current single-pool swap | Small existing implementation; explicit transaction policy. Official artifact provenance still needs checking. |
| `@uniswap/sdk-core` + `@uniswap/v3-sdk` | Prefer for v3 LP math and position calldata | Reuse tick/range/amount calculations; independently check limits, ownership, rounding and encoded actions. |
| Universal Router + its SDK | Preferred expansion candidate | Official recommendation for new integrations; supports v2/v3/v4. Adoption requires separately qualified deployment and Permit2/command policy. |
| Hosted Trading/Liquidity API | Retain verified adapters; reassess testnet availability later | Useful hosted routing/preparation, but no automatic fallback mixing quotes, permits or calldata between adapters. |
| Smart Order Router in backend | Defer until multi-pool routing is necessary | Searches routes considering gas; adds provider/multicall requirements beyond this one-pool demo. |
| Clone/deploy a separate Uniswap protocol | Outside this demo plan | Adds independent deployments and liquidity obligations. Source checkout for verification does not imply redeployment. |

## Stage 1 — Artifact provenance before swap execution

### Acquisition prerequisite, checked 2026-10-01

Host wallet quotes now pass both directions. Official Base deployments still map to core `1.0.0`, periphery `1.0.0` and swap-router-contracts `1.1.0`. Use `SwapRouter02` **and QuoterV2** from the latter package: [its tagged QuoterV2 source](https://raw.githubusercontent.com/Uniswap/swap-router-contracts/v1.1.0/contracts/lens/QuoterV2.sol) exists, while the attempted periphery `v1.0.0` QuoterV2 source path returned 404. The router package's [tagged manifest](https://raw.githubusercontent.com/Uniswap/swap-router-contracts/v1.1.0/package.json) also pins its own periphery dependency at `1.3.0`; preserve that transitive dependency rather than rewriting it to the manager's release.

Required verification-only package inputs:

| Contract | Package/version | Expected artifact path under that package |
|---|---|---|
| SwapRouter02 | `@uniswap/swap-router-contracts@1.1.0` | `artifacts/contracts/SwapRouter02.sol/SwapRouter02.json` |
| QuoterV2 | same router package | `artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json` |
| Factory/pool | `@uniswap/v3-core@1.0.0` | `artifacts/contracts/{UniswapV3Factory,UniswapV3Pool}.sol/*.json` |
| NFT position manager | `@uniswap/v3-periphery@1.0.0` | `artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json` |

The owner installed these exact packages; all five artifact paths now resolve locally and their fingerprints/ABI checks pass. Runtime/source proof remains open. The agent environment's earlier bounded npm request failed with `ENOTFOUND registry.npmjs.org`; acquisition therefore used the owner's host. For reproducibility, the installation command from `vezta-dex` was:

```bash
pnpm --store-dir=/Users/thongtran/Vezta/.pnpm-store \
  --filter @vezta-dex/api add -D --save-exact --ignore-scripts \
  @uniswap/swap-router-contracts@1.1.0 \
  @uniswap/v3-core@1.0.0 \
  @uniswap/v3-periphery@1.0.0
```

Expected: exact API devDependency entries, lockfile integrity/resolution data and locally readable artifacts. Keep these verification artifacts out of browser/runtime imports. Then verify installed package paths, ABI/calldata correspondence, source/build provenance and actual deployment bytecode, including immutables/linked libraries as applicable. Installing the packages alone does not enable execution; the remaining Stage 1 gates below stay unchecked.

The first host installation attempt failed with `ERR_PNPM_UNEXPECTED_STORE`: existing dependencies link to `/Users/thongtran/Vezta/.pnpm-store/v10`, whereas the host's default resolves to `/Users/thongtran/Library/pnpm/store/v10`. The command above explicitly selects the existing store root for this operation; `pnpm --store-dir=/Users/thongtran/Vezta/.pnpm-store store path` resolves to the required `v10` directory. Do not append `/v10` to `--store-dir`. The owner completed acquisition with this correction; no global configuration change or dependency reinstall was needed. On another checkout, substitute its actual store root.

- [ ] Resolve the exact package/release/source for the selected SwapRouter02, QuoterV2, pool and position manager. Record chain, address, package version, source revision and verification evidence; do not invent versions or equate an ABI match with runtime-bytecode proof.
- [x] Add only needed official artifacts with exact versions and lockfile integrity. Verification-only CLI modules remain outside browser/runtime imports.
- [x] Compare selectors/tuple fields and canonical calldata with the current builder for both directions and deadline, using installed artifact ABIs. Existing zero-value, mutation and expiry policy tests remain green. This is fixture-only encoding compatibility, not deployed-source proof.
- [ ] Verify live router configuration/code and factory/pool identity before connecting execution. Reuse source snapshots or reproducible compilation when necessary; a package artifact alone does not prove constructor/immutable values.

Important compatibility rule: `SwapRouter` in the v3 SDK targets the original v3 router, whose swap tuple includes a deadline. SwapRouter02 uses a different interface and deadline multicall. Use the correct contract artifact; evaluate `@uniswap/router-sdk` only if its encoder brings a concrete benefit and passes the existing policy. Do not replace the current encoder merely because a package is official.

## Stage 2 — Finish the bounded testnet wallet swap

- [ ] Build authentic fresh wallet-bound RPC quotes and opaque quote storage; never reuse the 120-second discovery preview as a 30-second execution quote.
- [ ] Add pinned EOA, balance, gas, nonce and allowance reads; enforce full input consumption and live impact limits. Confirm any reset receipt and reread allowance before exact approval.
- [ ] Simulate and recheck reviewed calldata; add explicit wallet submission, one-shot/reload recovery and economic receipt verification in both directions.
- [ ] Qualify fork and mocked browser cases independently from installed-wallet public-testnet evidence. The owner uses faucet test ETH/USDC for the latter; no mainnet funding is required for the demo.

## Stage 3 — Reuse SDKs for testnet LP

- [ ] Pin compatible `sdk-core`/`v3-sdk` versions and qualify the Base Sepolia NFT manager. Read canonical pool state at one stable block before constructing a position.
- [ ] Use SDK position math/calldata for mint, increase, decrease and collect where appropriate. Validate token order, tick spacing/bounds, desired input caps, displayed minima, recipient, deadline and ownership independently.
- [ ] Verify fees separately from withdrawn principal, residual allowances, full removal/collect/burn prerequisites, reorg/replacement recovery and wallet/NFT deltas.
- [ ] Use fork fixtures for owned NFT cases, then obtain public-testnet lifecycle evidence. Testnet ratios do not establish USD value, APR or real earnings.

## Stage 4 — Expansion review after demo acceptance

- [ ] Compare Universal Router/SDK and the verified hosted API for the intended chains, token pairs and routing needs. A v3 pool can remain v3 while its swap entrypoint changes.
- [ ] If Universal Router is selected, pin chain + router version + deployment address + compatible SDK together. Independently verify source/runtime/configuration, allowed commands, Permit2 amount/spender/domain/nonce/expiry, recipient, settlement and full-consumption policy.
- [ ] Use a separate adapter transition and fresh approval flow; do not reuse SwapRouter02 allowances or Polygon payloads. Preserve receipt/recovery behavior and qualify both swap directions before promotion.
- [ ] Consider Smart Order Router only after measuring the need for multi-hop/split routing and qualifying chain/provider support and latency. No assumption that it is lighter or that Base Sepolia works automatically.

## Source checkout and verification policy

Default to pinned packages for artifacts/SDKs. Add source by pinned Git submodule or reproducible snapshot only when needed for provenance, recompilation or Solidity integration tests. Record its upstream origin and revision; match the targeted deployment rather than following `main`. Keep official source edits separate from application code.

Implementation slices must use meaningful failing tests before behavior changes, then full tests, typecheck, lint and build. Fork, mock browser, live reads and public-testnet receipts are distinct evidence. CI does not sign or broadcast. Keep execution disabled until its gates pass.

## Official research sources

- [SDK selection and responsibilities](https://developers.uniswap.org/docs/sdks/overview).
- [SwapRouter02 artifacts](https://github.com/Uniswap/swap-router-contracts#local-deployment), [Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments).
- [V3 SDK router source](https://github.com/Uniswap/sdks/blob/main/sdks/v3-sdk/src/swapRouter.ts), [Router SDK](https://github.com/Uniswap/sdks/tree/main/sdks/router-sdk).
- [V3 position minting](https://developers.uniswap.org/docs/sdks/v3/guides/managing-liquidity/position-minting).
- [Universal Router overview](https://developers.uniswap.org/docs/protocols/universal-router/overview), [router/SDK version compatibility](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).
- [Smart Order Router requirements](https://github.com/Uniswap/smart-order-router#troubleshooting).
