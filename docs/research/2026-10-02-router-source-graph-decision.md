# Router source graph: observed evidence and accepted option A

## Evidence obtained

The owner downloaded the fixed Sourcify router lookup successfully (HTTP 200). The original public response remains unchanged and ignored at `.local-evidence/base-sepolia-source-router.raw.json`. The accepted reconstruction has now been imported separately into the validated cache.

- Response: 752,232 bytes; SHA256 `3f0bcc227b3ef4678b4a18c6fd1bcdd9548681c5675c9ba01b7f2c4abafcfc9c`.
- Standard-JSON input: 236 sources, 621,392 UTF-8 content bytes.
- Router metadata: 63 sources; all present in the input, with all 63 content hashes independently matching metadata.
- Input-only source paths: 173. No metadata-only paths or referenced-source hash mismatch.
- Compiler: `0.7.6+commit.7338295f`; target `contracts/SwapRouter02.sol:SwapRouter02`.
- Settings agree between input and metadata: optimizer enabled, 1,000,000 runs; Istanbul EVM; `bytecodeHash:none`; empty libraries/remappings.

The previous validator rejected both input source count >200 and unequal input/metadata source sets. Thus HTTP success did not imply validation success. This was a confirmed source-graph assumption mismatch, not an RPC/credential failure.

## Bounded candidate experiment

Without editing production code, publishing a cache, or changing the original payload, the existing validator was run against an in-memory candidate containing exactly the 63 metadata-listed source paths and the original settings. It passed all source hashes and exact historical snapshot runtime binding at block 47551649.

- Selected source bytes: 158,328.
- Prepared input SHA256: `b1e0542754b338b2e46ea8661e388fc4760f6694a2613ce00bbe34311f7275ad`.
- Runtime hash: `0x60e9352f5af4eee63b41456f85bf80c63044e98123ad599d41d87f2d068de0be`.
- `independentRebuildVerified`, `runtimeVerified`, `executionEnabled`: false.

This proves candidate consistency only. No compiler was installed/run and no independent deployment qualification is claimed. Solidity metadata describes contract sources/settings; filenames and settings must be preserved during reconstruction. See [Solidity 0.7.6 metadata](https://docs.soliditylang.org/en/v0.7.6/metadata.html).

## Choice presented to the owner

| Option | Implementation | Tradeoff |
|---|---|---|
| **A — recommended: metadata-listed graph** | Reconstruct a clearly labeled compiler input from all 63 hash-checked sources, preserve paths/settings, retain the original 236-file response separately, and reject missing imports rather than fetching replacements. Independently compile and verify all runtime bytes before qualifying execution. | Changes the compiler-input source inventory; reproducibility against deployment still must be proven. The reconstructed input must never be labeled the original provider input. |
| **B — original full input** | Retain all 236 source files for compilation, introduce a documented bounded source-count limit large enough for them, distinguish the 63 metadata-hashed sources from the 173 remaining files, and independently verify compiled runtime. | Larger compilation graph and revised resource policy; the 173 remaining files cannot be claimed metadata-hash-verified for this router. |

The owner selected **A** and authorized routine implementation choices. The reconstruction and offline import are implemented; independent compilation is the next gate.

## Actual import and preservation checks

`pnpm testnet:source-evidence --from-raw --save` succeeded on the real payload: 63 sources, 158,328 bytes, input SHA256 and runtime hash exactly as above, `snapshotAvailable:true`, `runtimeSnapshotMatches:true`, `evidenceSaved:true`. A second `pnpm testnet:source-evidence` reused the cache (`cached:true`) and reproduced those results without fetching sources. All three qualification/execution flags remain false.

Before/after SHA256 checks confirmed original raw bytes unchanged, along with snapshot SHA256 `78ea1e7cc1b30ee6fad577fd005dd59a97ca88458e62e5b4031329f26d5ec4fa`. Regression tests first failed on the 236-source shape and unsupported raw import; the focused suites then passed 34 tests, including guarded CLI import and symlink/missing-file rejection.

Final local verification: `pnpm test` passed 623 Vitest +85 Node tests; `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Existing React-version detection and Next.js workspace-root warnings remain. Author diff review confirmed fixed-role paths, no network fallback for missing/invalid raw input, preserved cache/directory guards, and unchanged execution gates. No fresh independent reviewer or CI run is claimed for this bounded amendment. The owner's existing `next-env.d.ts` development import was restored after build and excluded from the implementation commit.

## Routine choices made

- Use fixed `--from-raw` import to consume the owner's existing download without another lookup; missing raw input fails instead of fetching a replacement.
- Bound raw graphs to 512 files, selected metadata graphs to 200, and all raw content together to 4 MB. Every available entry remains literal and any optional hash is independently checked. Only selected entries become compiler input.
- Install the exact verification compiler into ignored `.local-evidence/compiler-tools/solc-0.7.6`, separate from application dependencies. Existing Polygon compiler tools are preserved.

## Owner action that can unblock the next gate

**Completed:** the owner installed the exact compiler and its version passed. Independent router compilation/runtime comparison subsequently succeeded; see [router rebuild evidence and the next QuoterV2 source action](2026-10-02-testnet-router-rebuild.md). The installation notes below record the previous environmental handoff.

The agent's bounded npm install failed DNS resolution (`ENOTFOUND registry.npmjs.org`). No Solidity 0.7.6 compiler is installed locally. On the owner's terminal, from `vezta-dex`, run:

```bash
npm install --prefix .local-evidence/compiler-tools/solc-0.7.6 \
  --registry=https://registry.npmjs.org --ignore-scripts \
  --no-audit --no-fund --save-exact solc@0.7.6
node -e "console.log(require('./.local-evidence/compiler-tools/solc-0.7.6/node_modules/solc').version())"
```

Expected version: `0.7.6+commit.7338295f.Emscripten.clang`. No API key, wallet, tokens or dev server is required. This uses npm in an isolated directory and does not change the workspace pnpm store. After installation, independently compile, inspect all compiler diagnostics, and map immutable/library references against deployment evidence before comparing every runtime byte. Missing imports, compiler errors or mismatches require investigation; do not enable execution or substitute guessed settings.
