# Base Sepolia runtime gate in wallet quotes

**Follow-up accepted:** owner host runtime-guarded quotes passed in both directions at 47556679 /47556684. The current next check is the [unsigned approval study](2026-10-02-testnet-unsigned-approval-progress.md); the quote command below records the earlier handoff and need not be repeated for that acceptance.

## Owner evidence received

The owner reported these read-only host results; the historical saved snapshot was not overwritten:

| Check | Block /time UTC | Actual result |
|---|---|---|
| `testnet:preflight` | 47555995 /2026-10-01 18:44:38 | Chain 84532, four initialized pools with active liquidity/quotes, `readOnlyQualified:true` |
| `testnet:deployment-snapshot` | 47556013 /2026-10-01 18:45:14 | Same chain, fresh/stable block, all five code rows present; every runtime hash matches its independently rebuilt historical proof |

`artifactRuntimeExactMatch:false` compares the installed package's raw artifact against deployed code, not the independently rebuilt exact-source/settings/immutable result. Snapshot `independentRebuildVerified:false`, `runtimeVerified:false` and `executionEnabled:false` remain correct because this inventory command does not combine those proofs or enable execution. See [all-five rebuild evidence](2026-10-02-testnet-pool-manager-rebuild.md).

## Implemented gate and choices

- Pin the five independently rebuilt runtime hashes and lengths in `apps/api/src/testnet-runtime.ts`. Provenance stays in the role reports. Requests do not compile or read ignored local evidence/test fixtures, and callers cannot supply replacement pins.
- Each wallet quote already reads dependency code/configuration, pool/tokens/decimals and EOA at a fresh pinned block. Require exactly five unique expected addresses on chain 84532, valid code, exact lengths and full keccak256 matches before asking the quoter or saving a quote.
- Keep final block-hash/freshness/timeout checks. A successful quote now reports `qualification.runtimeVerified:true`, scoped to those five code bodies at its recorded block. It still reports `executionEnabled:false`. No current storage, proxy upgrade state, token behavior, creation provenance, protocol audit or transaction readiness is implied.
- Nonempty changed code reports bounded `TESTNET_RUNTIME_MISMATCH`. Missing/malformed code can fail earlier as `TESTNET_CONFIGURATION_INVALID`; either blocks quoting/storage. Provider failures retain sanitized RPC errors.
- Use a 46,476-byte compressed public-bytecode fixture to test the real guard in quote/API/probe flows; synthetic code/state does not stand in for actual host acceptance. The fixture is test-only, contains no keys/raw provider responses and is never imported by application code.

Gas estimates, exact approval/reset/receipt execution, swap simulation/recheck and API/web submission/recovery remain open. **Phase 2 is incomplete; testnet execution remains disabled.** The next implementation slice is bounded unsigned preparation after confirming the new host quote path.

## Actual local/live status and next host check

The agent ran the updated wallet quote CLI with the owner's public test address. It failed on `getChainId` with `TESTNET_RPC_UNAVAILABLE`, diagnostic `kind:transport`; no quote was produced. This does not contradict the owner's working network or prove that its provider is faulty.

From `vezta-dex`, run the following once (no dev server, funding or wallet signing required):

```bash
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e pnpm testnet:wallet-quote
```

Share both bounded JSON rows or the error. Expected for both directions: chain 84532, fee 3000, valid minimum, fresh stored opaque quote ID, `configurationVerified:true`, **`runtimeVerified:true`**, **`executionEnabled:false`**. If code differs, report the mismatch; do not replace manifest pins or re-download evidence merely to change the result. Amounts may vary as testnet pool state changes; no economic price claim follows.

## Review

A fresh read-only reviewer found no Critical/Important/Minor findings in the pins, address/code guards, block binding, ordering, timeout/storage path or real-guard fixture tests. It confirmed fixture fingerprint/contents and no application fixture imports. Actual compiler/live results, full gates, pending docs, unrelated owner next-env changes, protocol security, creation provenance, descriptor proxy upgrades and token storage/current behavior were excluded. These scope limits remain explicit; the reviewer changed no files and ran no compiler, tests or RPC calls.

## Verification completed

- Before implementation: 12 focused failures established the missing runtime guard and changed qualification requirement.
- `pnpm test`: 74 Vitest files /661 tests and 85 Node script tests passed. Log: `/private/tmp/vezta-dex-runtime-quote-gate-tests.log` (local, not committed).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed. Typecheck initially caught the fixture helper's string/Hex annotation; corrected it and the mutation test's Hex expression. After that correction, the four directly affected test files passed again (22 tests).
- An initial filtered Vitest command from the API directory found no tests because configuration paths are rooted at the workspace. The corrected workspace-root invocation passed; no test configuration was changed.
- Lint retains the existing React detection warning; build retains the existing multiple-lockfile/workspace-root warning. Neither prevented those commands from succeeding. Remote CI was not run or observed.
- SHA-256 comparisons preserved all ten raw/normalized role evidence files and the historical deployment snapshot. Fixture fingerprint: `7db5a686fe5656137a10afe156018c6b94acbba5d3dc3ffd410fcec37bd3d94d`.
- No UI behavior was changed, and no browser acceptance is claimed. The owner's existing `apps/web/next-env.d.ts` development-route import was preserved and excluded from the change commit. API keys, evidence caches, wallet signatures and transactions were not modified or submitted.
