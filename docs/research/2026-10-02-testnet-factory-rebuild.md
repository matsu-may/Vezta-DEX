# Base Sepolia factory independent rebuild

## Actual evidence and result

The owner imported `--role factory --from-raw --save`. All **33 sources /149,127 bytes** and the saved Base Sepolia runtime binding passed at block **47551649**. The new offline command independently compiles and checks this evidence:

```bash
pnpm testnet:factory-rebuild
```

The real run matched every **24,535 runtime bytes**. Compiler AST maps one immutable declaration /one reference at byte offset 1361: `contracts/NoDelegateCall.sol:NoDelegateCall:original`. Its constructor assigns `address(this)`; the checker patches the compiler's zero slot with the independently curated factory deployment `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`, then compares the complete runtime. No bytes are masked or ignored. No warnings/errors appeared.

| Fingerprint | SHA256 or keccak256 |
|---|---|
| Original factory raw response SHA256 | `dfbf8731d3547d7e788c20e7596d786fcfa520f05d1e738ace92c2268decce15` |
| Factory normalized cache SHA256 | `cd0345c45c1464d7cbc00e958f2900d40ad09bf81f5cd8a0ed9283323f666868` |
| Prepared input SHA256 | `a82fa0868fd11dd7d3a483c9c22095cc5489452fb11782867a994140a48b8db1` |
| Locally compiled output SHA256 | `b2ffe4cab2f3060e2702d4f5f950ebe5e0c2d6cf8f4122882d4b6858bb93a633` |
| Runtime keccak256 | `0x02ee6e36873eea6fbb674a23d53b735646f12dc84efa08eac17872fe2fad9d06` |

## Decisions and scope

- Reuse the existing checker and bounded subprocess, with an explicit factory policy. Actual settings are Solidity `0.7.6+commit.7338295f`, **optimizer 800**, Istanbul, `bytecodeHash:none`, empty libraries/remappings and target `contracts/UniswapV3Factory.sol:UniswapV3Factory`. Router/quoter's 1,000,000-run policy is preserved.
- Reuse the installed official compiler whose binary SHA256 is `b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2`. Do not install a new application/CI compiler dependency.
- Select only the requested role's validated source/snapshot; fail on wrong settings, source hashes, runtime bytes, immutable identity or extra slots. No fallback to another role or network during rebuild.
- This proves historical runtime code, including its embedded code, rather than current storage/configuration or the separately deployed pool. `independentRebuildVerified:true` and `independentRuntimeMatch:true` are role-scoped; `independentCreationMatch:false`, `runtimeVerified:false` and `executionEnabled:false` remain explicit.

Three of five historical contract runtime rebuilds now pass: router, QuoterV2 and factory. Pool and position manager proofs, fresh qualification, gas/simulation and API/web execution remain open. **Phase 2 and the full testnet demo remain incomplete.**

## Next owner action

Actual pool and manager source lookups both returned `SOURCE_NETWORK_UNAVAILABLE` in the agent environment. Use the owner's working network from `vezta-dex`. These are separate downloads; import each only after its own HTTP 200:

```bash
curl --fail --show-error --max-time 30 --max-filesize 8000000 \
  'https://sourcify.dev/server/v2/contract/84532/0x46880b404CD35c165EDdefF7421019F8dD25F4Ad?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode' \
  --output .local-evidence/base-sepolia-source-pool.raw.json \
  --write-out '\nHTTP %{http_code}\n'
pnpm testnet:source-evidence --role pool --from-raw --save
```

```bash
curl --fail --show-error --max-time 30 --max-filesize 8000000 \
  'https://sourcify.dev/server/v2/contract/84532/0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode' \
  --output .local-evidence/base-sepolia-source-manager.raw.json \
  --write-out '\nHTTP %{http_code}\n'
pnpm testnet:source-evidence --role manager --from-raw --save
```

Share bounded JSON results or download errors. Expected chain 84532, matching role, source graph/snapshot checks true and `evidenceSaved:true`. Source acquisition alone still leaves all rebuild/runtime/execution flags false. No wallet, tokens, API key or dev server is needed. Preserve already imported evidence; do not overwrite it merely to change a result. Inspect each role's real compiler/settings/immutable policy before implementing its rebuild.

## Review

A fresh read-only reviewer found no Critical/Important/Minor findings. Role isolation, settings, source/snapshot guards, complete runtime/immutable checks and non-promotion flags were reviewed. Real compiler runs, evidence authenticity, fresh state, creation proof, other roles, hostile local tooling, pending docs and the owner's next-env diff were explicitly excluded; this report supplies actual local run evidence and keeps the remaining gates open. The reviewer changed no files and repeated no compiler or test runs.

## Verification

- Four new tests failed on the missing factory policy/CLI role, then all 22 focused tests passed. Boundary fixtures are synthetic; real local compiler runs separately establish the historical proof.
- `pnpm test`: 73 Vitest files /645 tests and 85 Node tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm build` and `git diff --check` passed. Existing React detection/workspace-root warnings remain. Remote CI was not observed.
- Real factory rebuild and router/quoter regression rebuilds passed; previous router/quoter input/output hashes stayed unchanged.
- SHA256 checks confirm all three raw responses, all three normalized caches and the saved snapshot are unchanged. The owner's pre-existing development import in `apps/web/next-env.d.ts` is preserved and excluded from the commit.
- CLI-only behavior changed; no UI/browser acceptance result is claimed. Fresh qualification and wallet execution remain separate unfinished gates.
