# EOA signer boundary and swap decoder evidence

## Implemented boundary

Owner selected **A — EOA first** on 2026-09-28. The read-only Permit2 plan now requests raw account code at the same Polygon block as its allowance read. Only explicit `0x` is supported. Deployed/delegated code returns `blocked-account` without signing data; malformed/missing code and expiry during RPC work fail closed. Quote and pool browsing remain available.

The internal signature helper verifies unchanged PermitSingle data using off-chain ECDSA recovery. It accepts canonical 64-byte EIP-2098 and 65-byte signatures, requires 27/28 recovery bytes for the latter, rejects zero/out-of-range/high-s scalars and returns the accepted bytes unchanged. It is not wired to a swap endpoint. There is no quote consume, `/swap` request, wallet signing or broadcast in this slice. Tests use a public deterministic test key locally only.

## Evidence before decoder implementation

The official [2.1.2 release](https://github.com/Uniswap/universal-router/releases/tag/2.1.2) identifies router commit `802fe4c18f47300e0f183e2a42e9146ec2ea9fc3` and Polygon router `0xDc264714F68d84CF29BC605589405E78bDBE7C9f`, and says the periphery includes PR 564. The pinned [Dispatcher](https://raw.githubusercontent.com/Uniswap/universal-router/802fe4c18f47300e0f183e2a42e9146ec2ea9fc3/contracts/base/Dispatcher.sol) decodes six-field V2/V3 swap commands, including a price array. A legacy five-field decoder would be wrong.

However, the tag's [foundry.lock](https://raw.githubusercontent.com/Uniswap/universal-router/2.1.2/foundry.lock) records periphery `3779387e5d296f39df543d23524b050f89a62917`. Its [IV4Router](https://raw.githubusercontent.com/Uniswap/v4-periphery/3779387e5d296f39df543d23524b050f89a62917/src/interfaces/IV4Router.sol) has no single-input price field and names the multi-input price array `maxHopSlippage`. The [interface at PR 564's merge revision](https://raw.githubusercontent.com/Uniswap/v4-periphery/545a5d2/src/interfaces/IV4Router.sol) adds a single-input price field and uses `minHopPriceX36` for the multi-input array. These layouts cannot be substituted without verification.

**Host evidence, 2026-09-28:** the owner ran the source probe successfully. At the fixed router commit the actual periphery gitlink is `545a5d2a87228167edde48f3b9eda122d1e3c4d6`; the lockfile still records `3779387e5d296f39df543d23524b050f89a62917` (`revisionsMatch: false`). Single-input V4 includes `minHopPriceX36` before `hookData`; multi-input has the price array before `amountIn` and `amountOutMinimum`. Source SHA-256: IV4Router `a577e593bd1948ffcf9ce26964ae1e47bafcf6dffcd40baeb700bcb902367a53`; Dispatcher `5f40089555d35d6ece37d61476c48280a8029062eb1dda17855eb7fe517a9882`.

The source-revision ambiguity is resolved: pin the actual gitlink, never the stale lock revision. **Still unresolved:** matching compiled source to the Polygon deployment, and actual Trading API calldata compatibility. The host result correctly reports `deployedSourceVerified: false` and `calldataValidated: false`. The application routing/version policy has not changed.

## Internal decoder

`swap-calldata.ts` now decodes the pinned ABI internally. It accepts canonical deadline-bearing `execute`, unchanged PermitSingle/signature bytes, wallet-funded exact-input V2/V3 paths and isolated V4 swap → settle → take paths without hooks. Declared input across all paths must equal the saved intent. Direct wallet outputs and a final output sweep must enforce at least the saved aggregate minimum output. Dynamic counts are bounded before decoding; decoding and reencoding must preserve every byte.

Unknown commands, revert flags, native assets, fees/transfers, prefunding, router-balance/open-credit swap inputs and mixed-protocol chaining fail closed. Unsupported calldata does not weaken the policy automatically. The decoder is disconnected from HTTP and wallet controls; its tests establish the modeled monetary checks, not deployed bytecode identity or live API compatibility. Signature recovery, account code, nonce, balances and simulation belong to the preparation caller.

## Next reproducible evidence

From `vezta-dex/`, run:

```bash
node scripts/smoke-router-provenance.mjs
```

The source probe above already passed on the owner's host. It reads the actual gitlink and reports ordered V4 struct fields and source fingerprints without credentials or wallet interaction.

The next host command is:

```bash
node scripts/smoke-router-deployment.mjs --save
```

This reads router bytecode at a pinned Polygon block, rechecks the block hash, then requests full Sourcify source/metadata. It uses `POLYGON_RPC_URL` from the API environment and makes no Trading API request, signature or broadcast. `--save` stores only public evidence in the gitignored `.superpowers/sdd/2026-09-28-eoa-swap-preparation/router-deployment-public.json`; it excludes the RPC URL and credentials. Output reports runtime agreement, compiler metadata and the two pinned source fingerprints. These observations deliberately leave `deployedSourceVerified` and `calldataValidated` false: complete dependencies, constructor immutables and live calldata still need review. A missing source or network failure remains a failed evidence gate.

Then match complete verified deployment source/compiler/dependencies and immutables to the selected router before exposing any prepared transaction endpoint. Implement single-use preparation and verify actual `/swap` response compatibility afterward. Installed-wallet connection, exact approval receipt, quote refresh, signed preparation, account/state rechecks, simulation and a small-swap receipt remain separate gates. Do not drop V4 or switch router versions without an owner decision.

## Host deployment evidence and verification decision

**Host run, 2026-09-28:** the deployment probe passed and saved the full public artifact. Polygon block `0x5a38aa6`, observed `2026-09-28T15:57:33.000Z`; runtime is 24,380 bytes. RPC bytes equal Sourcify's on-chain runtime. Both pinned source fingerprints match. Compiler is `0.8.26+commit.8a97fa7a`, optimizer enabled with 3000 runs, `viaIR: true`, EVM `cancun`, metadata `bytecodeHash: none`. Sourcify reports `runtimeMatch: match` and `creationMatch: match`, not `exact_match`.

Read-only local artifact inspection established:

- All **110 sources** occur in metadata and Standard JSON input. Every source content's Keccak-256 matches its metadata hash and its compiler-input content; no mismatch was found.
- Compiler output metadata and runtime/creation bytecode agree with the corresponding Sourcify fields.
- Runtime has **40 immutable replacements**, with no other declared transformation. Applying each declared value at its immutable reference produces byte-for-byte equality with both Sourcify's on-chain runtime and the saved RPC bytes; no runtime byte is skipped.
- Appending the decoded ten-field constructor arguments to creation bytecode reproduces Sourcify's creation bytes. This uses Sourcify's creation evidence, not a separately fetched deployment transaction.
- Observed runtime Keccak-256: `0x370874a6575cc7bd5cef1d58b30d0ce5905a90a54e955695573d2e896f1e9733`.

These checks establish artifact consistency and runtime agreement. **They are not an independent compiler run**, a full comparison of every dependency to its Git revision, or an audit. Complete compiler-to-source verification and the immutable/configuration checks remain under the deployment gate.

`runtimeExactMatch: false` is not a network/API error. Sourcify's [match definitions](https://docs.sourcify.dev/docs/exact-match-vs-match/) distinguish functional bytecode matching from metadata-backed source integrity. Solidity can [omit the metadata hash](https://docs.soliditylang.org/en/v0.8.26/metadata.html); this artifact does so and its CBOR contains only the compiler version. The two runtime tails already match, so the observed comparison does not reveal a metadata-byte difference. Without an embedded source fingerprint, even an independent rebuild cannot establish the exact historical comments/whitespace used at deployment. It can strengthen evidence that these supplied sources compile to the executable code.

**Owner decision before Task 3: A selected.**

| Option | Verification boundary | Tradeoff |
|---|---|---|
| **A — independent recompile (recommended)** | Compile the saved sources with the exact solc version/settings, compare the result to RPC runtime after checking immutables and Polygon configuration. | One additional compiler/probe step on the host; reduces dependence on Sourcify's supplied compiler output. |
| **B — reviewed Sourcify evidence** | Rely on Sourcify's compilation attestation plus the byte-for-byte runtime reconstruction above, and complete immutable/Polygon configuration checks. | Faster; compiler-to-source correctness remains dependent on the external verifier. |

Neither choice changes `runtimeExactMatch` or proves live Trading API calldata, simulation or a wallet receipt. The collector intentionally keeps both `deployedSourceVerified` and `calldataValidated` false. Preparation remains unstarted while the independent rebuild and configuration checks are open.

## Independent rebuild workflow (approved A)

From `vezta-dex/`, install the exact verification compiler in this plan's ignored tools directory, then run the offline rebuild:

```bash
npm install --prefix .superpowers/sdd/2026-09-28-eoa-swap-preparation/compiler-tools --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund --save-exact solc@0.8.26
node scripts/rebuild-router-deployment.mjs --compile
```

The npm command installs verification tools only; the application manifests/lockfile gain no compiler dependency. The rebuild reads the previously saved public deployment artifact, verifies source hashes/settings, checks the compiler's full version string, then compiles literal sources without an import callback. It requests AST and derives the 17 immutable variables from exact source/contract scopes, constructor fields and the Polygon EIP-712 domain. It does not trust Sourcify's immutable replacement values. Every reference must be a disjoint 32-byte zero placeholder within bounds; every final runtime byte must equal the saved RPC snapshot. Canonical constructor encoding and creation-bytecode equality are also checked against Sourcify's creation evidence.

The script uses no `.env`, API key, wallet or RPC request. It saves `router-compiler-input.json`, `router-compiler-output.json` and `router-rebuild-report.json` in the existing ignored workspace, and removes a previous success report before a new compile attempt. `--prepare` can validate/save input without installing or executing the compiler. Compilation errors and unsupported data return a fixed generic code.

**Expected host result:** `status: rebuild-verified`, `sourceCount: 110`, `immutableVariableCount: 17`, `immutableReferenceCount: 40`, `independentRuntimeMatch: true`, `independentCreationMatch: true`, and runtime hash `0x370874a6575cc7bd5cef1d58b30d0ce5905a90a54e955695573d2e896f1e9733`. The report includes compiler fingerprint and input/output digests. Configuration/deployment/calldata certification flags deliberately stay false until the separate review closes those gates; a successful rebuild is not a wallet execution result. Creation comparison uses Sourcify's supplied deployment bytes, not an independently retrieved transaction.

**Actual verification in this environment:** exact compiler installation failed with `ENOTFOUND registry.npmjs.org`; `--prepare` validated all 110 sources; `--compile` returned controlled `COMPILER_NOT_INSTALLED`. No independent compilation success is claimed. Twelve new Node tests passed after missing-module/CLI failures were observed. `pnpm test` passed **236 Vitest + 28 Node tests**; typecheck, lint and build exited 0 with the existing warnings.

Fresh independent DEX review passed the 12 focused tests and found no Critical/Important findings. **Deferred Minor:** saved input/output files contain a final newline, while reported SHA-256 digests currently hash the compiler JSON strings without that newline; hashing the complete saved file produces a different digest. The source Keccak checks and complete runtime comparison are unaffected. Independent execution, compiler-output authenticity, dependency Git-revision mapping, complete Polygon configuration, fresh chain state, live calldata/wallet/receipts, LP and protocol audit were not certified by this review and retain their separate evidence boundaries.

## Verification

### Account/source-probe slice (commit `d1a185d`)

Account-gate tests first failed (12 regressions); the signature suite initially failed for the missing module. Focused checks then passed 71 tests and typecheck. The raw RPC contract test additionally proves that explicit empty code is preserved at the requested block. The provenance extractor tests failed for the missing module before implementation.

- `pnpm test`: **204 Vitest + 12 Node tests passed**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0. Existing React-detection and Next workspace-root warnings remain.
- `node --check scripts/smoke-router-provenance.mjs`: exit 0.
- The source probe in this sandbox returned only `NETWORK_UNAVAILABLE`; no live gitlink/deployment result is claimed.
- Fresh independent DEX review found **no Critical, Important or Minor findings** in the completed EOA/probe slice. The reviewer independently ran 72 focused Vitest + 4 Node tests. Decoder/preparation, real wallet signing/broadcast/receipts and deployed V4 provenance were excluded because they are not implemented or verified; they remain explicit gates.

### Internal decoder/deployment-evidence slice

- Decoder tests failed for the missing module before implementation, then passed **32 tests** covering V2/V3/V4, split routes, recipients, settlement, PermitSingle, deadlines and malformed ABI.
- Deployment-evidence extractor tests failed for the missing module, then passed **4 Node tests**. Matching two source files never certifies the complete deployment.
- `pnpm test`: **236 Vitest + 16 Node tests passed**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0. Existing React-detection and Next workspace-root warnings remain.
- `node --check scripts/smoke-router-deployment.mjs`: exit 0. This sandbox's live probe returned controlled `NETWORK_UNAVAILABLE`; no live deployment result is claimed.
- Fresh independent DEX review found **no Critical, Important or Minor findings** in the decoder/evidence slice and independently passed 32 decoder + 4 extractor tests. Live deployment identity and actual calldata compatibility could not be judged without the public RPC/Sourcify artifact. The future preparation endpoint and already reviewed EOA slice were outside this review; those execution gates remain open.
