# EOA signer boundary and swap decoder evidence

## Implemented boundary

Owner selected **A — EOA first** on 2026-09-28. The read-only Permit2 plan now requests raw account code at the same Polygon block as its allowance read. Only explicit `0x` is supported. Deployed/delegated code returns `blocked-account` without signing data; malformed/missing code and expiry during RPC work fail closed. Quote and pool browsing remain available.

The signature helper verifies unchanged PermitSingle data using off-chain ECDSA recovery. It accepts canonical 64-byte EIP-2098 and 65-byte signatures, requires 27/28 recovery bytes for the latter, rejects zero/out-of-range/high-s scalars and returns accepted bytes unchanged. Single-use unsigned preparation now integrates this helper and the decoder, as described below. The browser remains read-only; tests use a public deterministic test key locally only.

## Evidence before decoder implementation

The official [2.1.2 release](https://github.com/Uniswap/universal-router/releases/tag/2.1.2) identifies router commit `802fe4c18f47300e0f183e2a42e9146ec2ea9fc3` and Polygon router `0xDc264714F68d84CF29BC605589405E78bDBE7C9f`, and says the periphery includes PR 564. The pinned [Dispatcher](https://raw.githubusercontent.com/Uniswap/universal-router/802fe4c18f47300e0f183e2a42e9146ec2ea9fc3/contracts/base/Dispatcher.sol) decodes six-field V2/V3 swap commands, including a price array. A legacy five-field decoder would be wrong.

However, the tag's [foundry.lock](https://raw.githubusercontent.com/Uniswap/universal-router/2.1.2/foundry.lock) records periphery `3779387e5d296f39df543d23524b050f89a62917`. Its [IV4Router](https://raw.githubusercontent.com/Uniswap/v4-periphery/3779387e5d296f39df543d23524b050f89a62917/src/interfaces/IV4Router.sol) has no single-input price field and names the multi-input price array `maxHopSlippage`. The [interface at PR 564's merge revision](https://raw.githubusercontent.com/Uniswap/v4-periphery/545a5d2/src/interfaces/IV4Router.sol) adds a single-input price field and uses `minHopPriceX36` for the multi-input array. These layouts cannot be substituted without verification.

**Host evidence, 2026-09-28:** the owner ran the source probe successfully. At the fixed router commit the actual periphery gitlink is `545a5d2a87228167edde48f3b9eda122d1e3c4d6`; the lockfile still records `3779387e5d296f39df543d23524b050f89a62917` (`revisionsMatch: false`). Single-input V4 includes `minHopPriceX36` before `hookData`; multi-input has the price array before `amountIn` and `amountOutMinimum`. Source SHA-256: IV4Router `a577e593bd1948ffcf9ce26964ae1e47bafcf6dffcd40baeb700bcb902367a53`; Dispatcher `5f40089555d35d6ece37d61476c48280a8029062eb1dda17855eb7fe517a9882`.

The source-revision ambiguity is resolved: pin the actual gitlink, never the stale lock revision. At this source-probe stage, deployment reconstruction and actual Trading API calldata compatibility were unresolved. The host result correctly reports `deployedSourceVerified: false` and `calldataValidated: false`; these collector flags do not automatically change after later manual review. The application routing/version policy has not changed.

## Internal decoder

`swap-calldata.ts` now decodes the pinned ABI internally. It accepts canonical deadline-bearing `execute`, unchanged PermitSingle/signature bytes, wallet-funded exact-input V2/V3 paths and isolated V4 swap → settle → take paths without hooks. Declared input across all paths must equal the saved intent. Direct wallet outputs and a final output sweep must enforce at least the saved aggregate minimum output. Dynamic counts are bounded before decoding; decoding and reencoding must preserve every byte.

Unknown commands, revert flags, native assets, fees/transfers, prefunding, router-balance/open-credit swap inputs and mixed-protocol chaining fail closed. Unsupported calldata does not weaken the policy automatically. The decoder is now called by unsigned preparation; wallet controls remain disabled. Decoder tests establish the modeled monetary checks, not live API compatibility. Signature recovery, account code, nonce, balances and simulation are enforced by the preparation caller.

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

Neither choice changes `runtimeExactMatch` or proves live Trading API calldata, simulation or a wallet receipt. The collector intentionally keeps both `deployedSourceVerified` and `calldataValidated` false. Preparation was held until the rebuild and scoped configuration review below.

## Independent rebuild workflow (approved A)

From `vezta-dex/`, install the exact verification compiler in this plan's ignored tools directory, then run the offline rebuild:

```bash
npm install --prefix .superpowers/sdd/2026-09-28-eoa-swap-preparation/compiler-tools --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund --save-exact solc@0.8.26
node scripts/rebuild-router-deployment.mjs --compile
```

The npm command installs verification tools only; the application manifests/lockfile gain no compiler dependency. The rebuild reads the previously saved public deployment artifact, verifies source hashes/settings, checks the compiler's full version string, then compiles literal sources without an import callback. It requests AST and derives the 17 immutable variables from exact source/contract scopes, constructor fields and the Polygon EIP-712 domain. It does not trust Sourcify's immutable replacement values. Every reference must be a disjoint 32-byte zero placeholder within bounds; every final runtime byte must equal the saved RPC snapshot. Canonical constructor encoding and creation-bytecode equality are also checked against Sourcify's creation evidence.

The script uses no `.env`, API key, wallet or RPC request. It saves `router-compiler-input.json`, `router-compiler-output.json` and `router-rebuild-report.json` in the existing ignored workspace, and removes a previous success report before a new compile attempt. `--prepare` can validate/save input without installing or executing the compiler. Compilation errors and unsupported data return a fixed generic code.

**Expected host result:** `status: rebuild-verified`, `sourceCount: 110`, `immutableVariableCount: 17`, `immutableReferenceCount: 40`, `independentRuntimeMatch: true`, `independentCreationMatch: true`, and runtime hash `0x370874a6575cc7bd5cef1d58b30d0ce5905a90a54e955695573d2e896f1e9733`. The report includes compiler fingerprint and input/output digests. Configuration/deployment/calldata certification flags deliberately stay false until the separate review closes those gates; a successful rebuild is not a wallet execution result. Creation comparison uses Sourcify's supplied deployment bytes, not an independently retrieved transaction.

**Initial verification:** exact compiler installation failed with `ENOTFOUND registry.npmjs.org`; `--prepare` validated all 110 sources; `--compile` returned controlled `COMPILER_NOT_INSTALLED`. Twelve new Node tests passed after missing-module/CLI failures were observed. `pnpm test` passed **236 Vitest + 28 Node tests**; typecheck, lint and build exited 0 with the existing warnings. The successful host installation and actual local compilation below supersede that compiler availability blocker.

Fresh independent DEX review passed the 12 focused tests and found no Critical/Important findings. **Deferred Minor:** saved input/output files contain a final newline, while reported SHA-256 digests currently hash the compiler JSON strings without that newline; hashing the complete saved file produces a different digest. The source Keccak checks and complete runtime comparison are unaffected. Independent execution, compiler-output authenticity, dependency Git-revision mapping, complete Polygon configuration, fresh chain state, live calldata/wallet/receipts, LP and protocol audit were not certified by this review and retain their separate evidence boundaries.

## Successful rebuild and configuration review

The owner installed the exact compiler and rebuilt at `2026-09-28T16:36:28.135Z`. A second actual offline compiler run here finished at `2026-09-28T16:38:16.817Z`, with identical compiler/input/output/evidence digests. It compiled all 110 sources, derived 17 immutable variables and 40 references, and reproduced every runtime byte at the saved Polygon block. Creation bytes also match Sourcify's supplied creation evidence; a separately fetched creation transaction remains unverified.

| Artifact | SHA-256 |
|---|---|
| Public deployment evidence | `09d242caa63194600ae3efaac70c56e469e49f0e49b138f851d3f70eaf0c9490` |
| Compiler input string | `e947f73182362f147feef9b2581702e95599c9ceaca91bdef7748e48da019b24` |
| Compiler output string | `3897acff8f82c05a8ae1827eca00fd1a4402888bdf4b8a22bd2642e8b98fbd51` |
| Local soljson compiler | `35ba6661f3bdaed995fc7af14c405502290cf681b3fd062fe8738cfdf6db14ed` |

For input/output digests, remove the one saved final newline before hashing (deferred Minor above). The observed runtime hash remains `0x370874a6575cc7bd5cef1d58b30d0ce5905a90a54e955695573d2e896f1e9733`.

Manual constructor review against primary sources:

| Field | Recompiled Polygon value | Reference |
|---|---|---|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | [v4 deployments](https://developers.uniswap.org/docs/protocols/v4/deployments) |
| WETH9 (wrapped native) | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` | [Polygon v3 deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments) |
| V2 factory | `0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C` | [v2 deployments](https://developers.uniswap.org/docs/protocols/v2/deployments) |
| V3 factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | Polygon v3 deployments above |
| Pair init hash | `0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f` | [V2 library](https://raw.githubusercontent.com/Uniswap/v2-periphery/master/contracts/libraries/UniswapV2Library.sol) |
| Pool init hash | `0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54` | [V3 library](https://raw.githubusercontent.com/Uniswap/v3-periphery/main/contracts/libraries/PoolAddress.sol) |
| V4 PoolManager | `0x67366782805870060151383F4BbFF9daB53e5cD6` | v4 deployments above |
| V3 position manager | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` | Polygon v3 deployments above |
| V4 position manager | `0x1Ec2eBf4F37E7363FDfe3551602425af0B3ceef9` | v4 deployments above |
| SpokePool | `0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096` | Release author's all-ten-parameter attestation; [Across](https://docs.across.to/chains-and-contracts) shows the abbreviated Polygon entry only |

WETH9 here is Polygon's wrapped native token; it is distinct from the curated bridged WETH `0x7ceb…f619`. No native-wrap, bridge or position command is accepted. The full pinned deploy script and every dependency's historical Git-file mapping were not retrieved; those claims remain excluded. The complete literal source graph has independent functional runtime proof, and the source-pinned decoder checks only the allowed ERC20 swap effects. This scoped evidence closes the prerequisite for internal unsigned preparation; it does not certify unused integrations or exact historical source text. Collector certification flags are retained unchanged.

## Single-use unsigned preparation

`POST /api/v1/swap-preparation` accepts the curated intent, opaque `quoteId` and optional 64/65-byte signature. It rejects caller-supplied quotes/messages/transactions. It verifies the saved message, EOA code, nonce, exact ERC20 allowance and input balance before synchronously consuming the quote and requesting [swap calldata](https://developers.uniswap.org/docs/api-reference/create_swap_transaction) with `simulateTransaction: true` and a deadline bounded by the original quote lifetime. One shared client applies the 5 RPS budget to quotes and preparation. Signed requests are never automatically retried; failed preparations need a new quote and message review.

Accepted owner/message hashes are retained until the signature deadline in the bounded shared in-memory quote store. The same PermitSingle cannot be prepared under another quote ID, including with an equivalent compact signature. Hash records cap at 128; expiry frees capacity. A restart loses both quotes and replay records. Multi-process/public use still requires a shared TTL/replay store and key limiter; a PermitSingle does not cryptographically bind the output or quote ID.

The preparer checks chain/from/router/value, decodes every monetary effect, reads fresh state and calls `eth_call` and `eth_estimateGas` from the owner at explicit block numbers. It discards upstream gas/fee/authorization fields and uses local RPC gas price plus 20% fee/gas headroom, checking the native balance against the full limit. `eth_gasPrice` is a live suggestion, not a pinned-block read. If Polygon advances during work, state is rechecked and simulation/gas are refreshed at the newer block without replaying `/swap`. TTL and account/state checks must still pass before return. This is a block snapshot, not a reservation against later changes.

Only the validated unsigned transaction, original intent/expiry/deadline and simulation provenance are returned with `Cache-Control: no-store`. Executable calldata necessarily embeds the accepted Permit2 signature: treat the full request and response as sensitive, never log them, and never send a real signature in chat. No separate signature, raw quote, API credential or upstream error is exposed. No server signing/broadcast and no browser write control is added.

Deterministic tests cover saved-message binding, concurrency, replay across quote IDs, expiry, state changes, malformed/unsafe calldata, simulation errors, local fee/balance checks and generic HTTP errors. Live signed `/swap` calldata compatibility, installed-wallet behavior, funded exact-approval receipt and a small-swap receipt remain open gates. These require the owner's wallet flow; offline recompilation alone cannot establish them.

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
