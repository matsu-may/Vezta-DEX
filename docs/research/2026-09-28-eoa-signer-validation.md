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
