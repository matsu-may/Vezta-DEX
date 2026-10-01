# Base Sepolia pool and position manager independent rebuilds

## Actual results

Both owner-imported source graphs and runtime bindings passed against Base Sepolia block **47551649**. The agent independently compiled both using the previously installed, fingerprint-checked Solidity `0.7.6+commit.7338295f.Emscripten.clang`:

```bash
pnpm testnet:pool-rebuild
pnpm testnet:manager-rebuild
```

| Role | Sources /source bytes | Optimizer runs | Runtime bytes | Immutable declarations /references |
|---|---|---|---|---|
| Pool | 31 /144,871 | 800 | 22,142 | 7 /27 |
| Manager | 55 /175,707 | 2,000 | 24,384 | 5 /17 |

Every runtime byte matched, with no compiler errors/warnings. Router/quoter/factory regression rebuilds also passed with unchanged input/output fingerprints. **All five historical runtime proofs now pass.** Overall fresh runtime qualification and execution remain disabled; this does not finish Phase 2 or the demo.

## Immutable policy and choices

The existing verifier now binds each compiler AST declaration to an explicit expected type and 32-byte word. It still requires every reference to be known, zero-filled, 32 bytes, in range and nonoverlapping before complete byte comparison. No masking or extraction of expected values from observed runtime is used.

- Pool self-address, factory and token0/token1 come from the selected USDC/WETH pool policy. Fee is 3000 (`uint24`); tick spacing is 60 (`int24`). `Tick.tickSpacingToMaxLiquidityPerTick` uses aligned ±887220 ticks, 29,575 possible ticks and `floor((2^128-1)/29575) = 11505743598341114571880798222544994` (`uint128`). Values and Solidity types are independently enforced.
- Manager factory/WETH match the curated chain registry. `ERC721Permit` constructor fixes NFT name `Uniswap V3 Positions NFT-V1` and version `1`; their keccak256 hashes are recomputed from those strings, then compared as `bytes32` bindings.
- Manager `_tokenDescriptor` points to `0x1E2A708040Eb6Ed08893E27E35D399e8E8e7857E`, the **TransparentUpgradeableProxy** in the [official Uniswap Base Sepolia deployment table](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments). This is distinct from the NFTDescriptor library and descriptor implementation. This runtime proof checks the manager's immutable address; it does not audit the proxy's implementation, admin or current upgrade state.
- Keep the same compiler/tool isolation and bounds. Other roles retain their settings, typed address bindings and historical results. The rebuild CLI reads local evidence only and does not alter it.

`independentRebuildVerified:true` /`independentRuntimeMatch:true` remain scoped to the rebuilt role and saved historical snapshot. `independentCreationMatch:false`, `runtimeVerified:false`, `executionEnabled:false` remain explicit. No creation-transaction proof, app execution, signing or submission is claimed.

## Fingerprints

| Evidence | SHA256 or keccak256 |
|---|---|
| Pool original raw SHA256 | `2aa3f68783f8a4deef3bacfcdcf758ffb42c7dd7b2fda6f70fa306abc938ece4` |
| Pool normalized cache SHA256 | `82d38a9f074431260d025bde34c887f970206c67510a4f838d15621ffe46cd86` |
| Pool input SHA256 | `536392ce7bca7c2cef0d3ff01cfe5d7d1d773771e94fc0433ce3d583bcc1799f` |
| Pool compiler output SHA256 | `b42aad261a151ecbb2ad032deb2264d67ee852e938f3634a5f2cacb3398d6954` |
| Pool runtime keccak256 | `0xbbda0bdc9da3fd1f4832633a5ea75dc401ca24fdbca3d64a2511f27583ec7c4d` |
| Manager original raw SHA256 | `06c27e4e96fde6c149adf6d3367959f05225d7434df68e15419917c830722000` |
| Manager normalized cache SHA256 | `c088f62a131552a9ca043f7d2c29d9d05424914291ddd6e06673bed7f22e5064` |
| Manager input SHA256 | `ff6521a5e52f445376aadd31df89b4b0b9a82248afb06a3e206d5a3ad1384ef9` |
| Manager compiler output SHA256 | `c418b1620c9b1526dbc810e5c4d9d132adef3d33bae9f3a1388d39303ad68917` |
| Manager runtime keccak256 | `0x60f3e548ae28f43dfdedd281dc9233b7135dcae55050662c985583df84bc453d` |

## Next host checks and unfinished work

Actual `testnet:preflight` returned `RPC_UNAVAILABLE`. `testnet:deployment-snapshot` failed at `getChainId` with a transport error and `TESTNET_DEPLOYMENT_RPC_UNAVAILABLE` in the agent environment. This does not establish that the owner's configured provider is faulty.

From `vezta-dex`, run these **one at a time**, without `--save`, then share their sanitized JSON:

```bash
pnpm testnet:preflight
pnpm testnet:deployment-snapshot
```

No wallet, test assets or dev server is required. Preserve the existing saved historical snapshot. Preflight should report chain 84532 and `readOnlyQualified:true`; snapshot checks should report same chain, fresh/stable block and all code present. Compare each current runtime hash to the five historical proofs; artifact exact-match/rebuild/execution flags alone are not the fresh acceptance result. Report errors or differences rather than redownloading source to change a result.

After fresh RPC qualification: prepare trustworthy execution-gate consumption, gas/simulation and approval/reset/receipt APIs; complete swap controller/recovery and disposable-fork/browser evidence; then Base Sepolia LP lifecycle and desktop integration. Installed-wallet public-testnet receipts and acceptance remain owner-operated later gates. Creation-bytecode proof and descriptor proxy inspection remain separately identified gaps.

## Review

A fresh read-only reviewer found no Critical/Important/Minor findings; typed bindings, Tick formula, constructors, official proxy mapping, shared guards and regression policies were checked. Fresh state/execution, creation transaction provenance, proxy implementation/upgrades, actual compiler/gate runs, pending docs and unrelated owner next-env changes were explicitly excluded. Those limits are preserved here; the parent ran the actual local checks. The reviewer modified no files and repeated no compiler or full-suite runs.

## Verification

- Eight new tests failed on missing pool/manager roles, then all 30 focused tests passed. Fixtures use hand-checked words and exercise the real verifier; actual compiler runs separately establish historical evidence.
- `pnpm test`: 73 Vitest files /653 tests and 85 Node tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Existing React detection/workspace-root warnings remain. Remote CI was not observed.
- Both new role commands and all three earlier regression commands passed. Earlier input/output hashes are identical to their previous proofs.
- SHA256 checks confirm all five raw responses, all five normalized caches and the historical deployment snapshot are unchanged. The owner's existing development import in `apps/web/next-env.d.ts` is preserved and excluded from the commit.
- Only CLI verification changed; no browser or installed-wallet acceptance is claimed. Actual fresh RPC failures and remaining execution gates are reported above.
