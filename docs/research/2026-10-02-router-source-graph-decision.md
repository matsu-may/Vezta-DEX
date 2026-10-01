# Router source graph: observed evidence and pending choice

## Evidence obtained

The owner downloaded the fixed Sourcify router lookup successfully (HTTP 200). The original public response remains ignored at `.local-evidence/base-sepolia-source-router.raw.json`; it was not imported into the validated cache or modified.

- Response: 752,232 bytes; SHA256 `3f0bcc227b3ef4678b4a18c6fd1bcdd9548681c5675c9ba01b7f2c4abafcfc9c`.
- Standard-JSON input: 236 sources, 621,392 UTF-8 content bytes.
- Router metadata: 63 sources; all present in the input, with all 63 content hashes independently matching metadata.
- Input-only source paths: 173. No metadata-only paths or referenced-source hash mismatch.
- Compiler: `0.7.6+commit.7338295f`; target `contracts/SwapRouter02.sol:SwapRouter02`.
- Settings agree between input and metadata: optimizer enabled, 1,000,000 runs; Istanbul EVM; `bytecodeHash:none`; empty libraries/remappings.

The current validator rejects both input source count >200 and unequal input/metadata source sets. Thus HTTP success did not imply validation success. This is a confirmed source-graph assumption mismatch, not an RPC/credential failure.

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

The owner requested a choice when a verification approach needs replacement. Neither option is implemented yet. Do not silently raise limits, skip hash checks, discard paths/settings, or enable execution. Once chosen, add regression tests reproducing this observed shape, fix the acquisition/import path, then qualify the exact compiler and immutable/runtime comparison.
