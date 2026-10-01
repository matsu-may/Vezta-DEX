# Base Sepolia QuoterV2 independent rebuild

## Actual evidence and result

The owner imported QuoterV2 public source with `--role quoter --from-raw --save`. The source graph and saved runtime binding passed at Base Sepolia block **47551649**. The agent compiled all **21 sources /73,881 bytes** with the already installed, fingerprint-checked Solidity `0.7.6+commit.7338295f.Emscripten.clang`.

```bash
pnpm testnet:quoter-rebuild
```

This succeeded on real local evidence: every **8,273 runtime bytes** matched after mapping **2 immutable declarations /4 references** through compiler AST. Values are independently constrained to curated Base Sepolia v3 factory/WETH. No compiler warnings/errors appeared. Router's zero v2 factory and position manager are not QuoterV2 bindings.

| Fingerprint | Value |
|---|---|
| Original quoter raw response SHA256 | `f4c073c971fea054d213b956d32368e53530152e92867247f62c05321150d1a3` |
| Quoter normalized cache SHA256 | `f364da8346462bc0baf2fc12f71a143e74d7abd0bffa4b2b86d57a6609db2ac9` |
| Prepared input SHA256 | `db98ce71b8ed7a6d6e84a4362aea08ebd8b36c431bb86055235c1275aaff213b` |
| Locally compiled output SHA256 | `634d02f7c660bbc8c845ddd30e6cf3bb7fc0e3a632150ea1a5919fda98b365a5` |
| Runtime keccak256 | `0x156c129c09f1c7abd7be44016fc679cd622ca2018484cee6806c213c1f8236b3` |

Settings match the [router proof](2026-10-02-testnet-router-rebuild.md): optimizer 1,000,000, Istanbul, `bytecodeHash:none`, empty libraries/remappings, literal sources and no import callback. Compiler metadata/source hashes and every runtime byte must agree; unknown, overlapping, prefilled or unmapped immutable slots fail.

## Changes and decisions

- Extend the existing checker with explicit router/quoter policies and shared full-byte comparison; preserve the router command and historical output fingerprints.
- Add `testnet:quoter-rebuild` and accept exactly one `--role router|quoter` on the underlying CLI. Other/duplicate roles fail before acquisition; factory/pool/manager rebuild policies are not implemented yet.
- Extract the bounded compiler subprocess runner and test launch/input, error/timeout, malformed output, version and size contracts. This addresses the earlier review's subprocess-boundary gap without installing Solidity into application or CI dependencies.
- Keep source/snapshot files unchanged and print recomputed summaries only. `independentRebuildVerified:true` is scoped to each rebuilt role and historical snapshot; `independentCreationMatch:false`, `runtimeVerified:false`, `executionEnabled:false` remain explicit. No app route/UI or signing/broadcast flow changed.

## Next owner action

Factory source acquisition returned `SOURCE_NETWORK_UNAVAILABLE` in the agent environment. From `vezta-dex`, use the owner's working network:

```bash
curl --fail --show-error --max-time 30 --max-filesize 8000000 \
  'https://sourcify.dev/server/v2/contract/84532/0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode' \
  --output .local-evidence/base-sepolia-source-factory.raw.json \
  --write-out '\nHTTP %{http_code}\n'
pnpm testnet:source-evidence --role factory --from-raw --save
```

Run the second command only after HTTP 200. Share the bounded JSON or download error. Expected role `factory`, chain 84532, source graph/snapshot checks true and `evidenceSaved:true`; acquisition summaries still keep all execution/rebuild flags false. Do not download over existing evidence merely to change a result; report any mismatch. No wallet, tokens, API key or dev server is needed.

Factory, pool and position manager independent rebuilds remain open. Check their actual compiler/settings/immutable policies after acquisition rather than assuming they match router/quoter. Fresh configuration, gas/simulation, API/web wallet execution and receipt recovery are later gates. **Phase 2 and the complete testnet demo are not finished.**

## Review

A fresh read-only reviewer found no Critical/Important/Minor findings in the code. Source/snapshot/role isolation, immutable mapping, full-byte comparison, compiler fingerprint/version and runner bounds were reviewed. Creation proof, other roles, fresh execution, hostile local tooling, unrelated owner next-env changes and unfinished docs were explicitly outside that review; they remain open or excluded as stated. The reviewer did not repeat the real compiler runs or full suite.

## Verification

- New behavior tests failed before implementation, then all 18 focused tests passed. Fixtures exercise boundaries; the real local compiler runs above provide the historical runtime evidence.
- `pnpm test`: 73 Vitest files /641 tests and 85 Node tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Existing React detection and workspace-root warnings remain; remote CI was not observed.
- Actual `testnet:quoter-rebuild` and router regression runs passed. Router input/output hashes remain identical to its previous proof.
- SHA256 checks confirm both raw responses, both normalized caches and the deployment snapshot are unchanged. The owner's pre-existing `apps/web/next-env.d.ts` development import is preserved and excluded from this change.
- No browser acceptance run is needed for this CLI-only change. Public-testnet wallet execution, fresh RPC qualification and the remaining dependency proofs are still separate gates.
