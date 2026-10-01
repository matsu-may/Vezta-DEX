# Base Sepolia router independent rebuild

## Scope and actual result

The owner installed `solc@0.7.6` into ignored `.local-evidence/compiler-tools/solc-0.7.6` and reported `0.7.6+commit.7338295f.Emscripten.clang`. The agent then independently compiled the accepted 63-source reconstruction and ran the reusable CLI on real saved evidence:

```bash
pnpm testnet:router-rebuild
```

The command succeeded against Base Sepolia router `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`, historical snapshot block **47551649**. Every runtime byte matched after independently binding all four immutable declarations across **23 references**. Runtime size: **24,497 bytes**. No source/snapshot cache or application execution flag was modified.

| Fingerprint | SHA256 / runtime keccak256 |
|---|---|
| Compiler `soljson.js` | `b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2` |
| Prepared input | `b1e0542754b338b2e46ea8661e388fc4760f6694a2613ce00bbe34311f7275ad` |
| Local compiler output | `6f5c7ddd488b80c8b9e6d910256a71db77d1baf1917ab83f86f09ce646f61e10` |
| Reconstructed and saved runtime | `0x60e9352f5af4eee63b41456f85bf80c63044e98123ad599d41d87f2d068de0be` |

The compiler hash matches the official [Solidity binary release index](https://raw.githubusercontent.com/ethereum/solc-bin/gh-pages/bin/list.json), entry `soljson-v0.7.6+commit.7338295f.js`. Compilation produced one upstream SPDX warning (`1878`) and no errors. Upstream source content is preserved rather than editing it to remove that warning. npm's legacy dependency warnings concern the isolated historical compiler tooling; application dependencies were not upgraded/downgraded.

## Immutable and settings policy

Compiler settings remain optimizer enabled / 1,000,000 runs, Istanbul EVM, `metadata.bytecodeHash:none`, empty libraries/remappings. Only output selection changes. Compiler metadata must reproduce all selected source hashes and settings. Every immutable is mapped through AST source path + contract + variable name, not hard-coded numeric IDs or provider substitution values:

| Declaration | Required value |
|---|---|
| `PeripheryImmutableState.factory` | Curated Base Sepolia v3 factory `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| `PeripheryImmutableState.WETH9` | Base WETH `0x4200000000000000000000000000000000000006` |
| `ImmutableState.positionManager` | Curated manager `0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2` |
| `ImmutableState.factoryV2` | Observed zero address; an explicit constraint for this v3-only deployment |

The three nonzero identities match the [official Base Sepolia deployment mapping](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments). The zero factoryV2 is observed in all six relevant immutable slots, not inferred from the v3 table. It does not qualify any v2 route. Each compiler reference must have a unique nonoverlapping in-bounds 32-byte zero placeholder; every reference must be accounted for before patching. All patched bytes, including the metadata trailer, must match source-provider runtime already bound to the snapshot. No executable bytes are ignored. Solidity describes these constructor-set immutable substitutions in its [0.7.6 contracts documentation](https://docs.soliditylang.org/en/v0.7.6/contracts.html#constant-and-immutable-state-variables).

## CLI boundary and selected choices

- Require validated local source cache and historical snapshot. No network acquisition, `.env` read, arbitrary file/compiler option, signing or broadcasting in the rebuild command.
- Pin the compiler binary fingerprint before running it, then verify the exact compiler-reported version. Treat the installed npm wrapper and checkout as trusted local tooling; this is not a sandbox against malicious local processes.
- Compile in a separate process with a 60-second kill timeout, 512-MB V8 heap setting and bounded input/output buffers. The heap setting is not a bound on all native/WASM memory. Literal input only; no import callback can load replacement files.
- Print a bounded summary and hashes; do not publish a persistent success file that could be mistaken for fresh execution readiness. Running the command again recomputes the result.
- `independentRebuildVerified:true` and `independentRuntimeMatch:true` apply only to this router and historical snapshot. `independentCreationMatch:false`: creation transaction/input is not in the saved evidence. `runtimeVerified:false` and `executionEnabled:false` remain unchanged overall.

## Next useful owner action

**Completed follow-up:** the owner imported QuoterV2 and its independent runtime rebuild subsequently passed. See [QuoterV2 proof and the current factory-source action](2026-10-02-testnet-quoter-rebuild.md). The command below is the historical handoff; do not download QuoterV2 again.

The next source lookup, QuoterV2, failed `SOURCE_NETWORK_UNAVAILABLE` in the agent environment. To preserve its original public response as with the router, run from `vezta-dex`:

```bash
curl --fail --show-error --max-time 30 --max-filesize 8000000 \
  'https://sourcify.dev/server/v2/contract/84532/0xC5290058841028F1614F3A6F0F5816cAd0df5E27?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode' \
  --output .local-evidence/base-sepolia-source-quoter.raw.json \
  --write-out '\nHTTP %{http_code}\n'
pnpm testnet:source-evidence --role quoter --from-raw --save
```

No wallet, token, API key or running dev server is needed. Share the HTTP status and bounded JSON only. Expected: role `quoter`, chain 84532, source graph/snapshot runtime checks true, saved evidence true. These source-only checks still report all three qualification/execution flags false. Stop/report a failed download or validation rather than changing deployment addresses or discarding evidence.

Factory, pool and position manager need their own source/build qualification afterward; a successful router proof does not qualify them. Fresh dependency configuration, simulation, gas, wallet execution/recovery and receipt evidence remain later gates. **Phase 2 is still incomplete; the testnet demo is not yet accepted.**

## Verification and independent review

Five verifier behavior tests failed before implementation; three CLI boundary tests also failed before implementation. The suites then passed all eight tests: exact compiler identity, metadata/settings/source mismatch, compiler errors/links, every immutable reference, missing snapshot/compiler, evidence preservation and sanitized unsupported options. A fixture shared-source-hash alias was corrected so output-hash mutation tests change only compiler output, not input evidence.

A fresh read-only reviewer found no Critical/Important issues. One Minor is deferred: automated CLI tests stop before spawning a compiler, so launch/output protocol regression coverage is incomplete. The real installed-compiler CLI run covers the current path; this does not require adding a compiler to application/CI dependencies. Add compiler-independent subprocess boundary coverage when extending this runner to other roles. The review excluded creation-bytecode proof, other roles, fresh live/product qualification and hostile local tooling; those exclusions retain the open gates above, not silent completion claims.

Final local gates: `pnpm test` passed **631 Vitest +85 Node** tests; typecheck/lint/build and `git diff --check` passed. Two new unused-variable lint warnings were removed, then tests/typecheck/lint and the real compiler CLI were rerun. Only the existing React-version detection and Next.js workspace-root warnings remain. Repeated real compilations produced the same input/output/runtime hashes. Before/after checks preserved original raw and snapshot SHA256 values recorded in the source-graph decision. No remote CI run or browser change is claimed. The owner's existing development `next-env.d.ts` import is restored after build and excluded from the implementation commit.
