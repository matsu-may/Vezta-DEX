# EOA signer boundary and swap decoder evidence

## Implemented boundary

Owner selected **A — EOA first** on 2026-09-28. The read-only Permit2 plan now requests raw account code at the same Polygon block as its allowance read. Only explicit `0x` is supported. Deployed/delegated code returns `blocked-account` without signing data; malformed/missing code and expiry during RPC work fail closed. Quote and pool browsing remain available.

The internal signature helper verifies unchanged PermitSingle data using off-chain ECDSA recovery. It accepts canonical 64-byte EIP-2098 and 65-byte signatures, requires 27/28 recovery bytes for the latter, rejects zero/out-of-range/high-s scalars and returns the accepted bytes unchanged. It is not wired to a swap endpoint. There is no quote consume, `/swap` request, wallet signing or broadcast in this slice. Tests use a public deterministic test key locally only.

## Evidence before decoder implementation

The official [2.1.2 release](https://github.com/Uniswap/universal-router/releases/tag/2.1.2) identifies router commit `802fe4c18f47300e0f183e2a42e9146ec2ea9fc3` and Polygon router `0xDc264714F68d84CF29BC605589405E78bDBE7C9f`, and says the periphery includes PR 564. The pinned [Dispatcher](https://raw.githubusercontent.com/Uniswap/universal-router/802fe4c18f47300e0f183e2a42e9146ec2ea9fc3/contracts/base/Dispatcher.sol) decodes six-field V2/V3 swap commands, including a price array. A legacy five-field decoder would be wrong.

However, the tag's [foundry.lock](https://raw.githubusercontent.com/Uniswap/universal-router/2.1.2/foundry.lock) records periphery `3779387e5d296f39df543d23524b050f89a62917`. Its [IV4Router](https://raw.githubusercontent.com/Uniswap/v4-periphery/3779387e5d296f39df543d23524b050f89a62917/src/interfaces/IV4Router.sol) has no single-input price field and names the multi-input price array `maxHopSlippage`. The [interface at PR 564's merge revision](https://raw.githubusercontent.com/Uniswap/v4-periphery/545a5d2/src/interfaces/IV4Router.sol) adds a single-input price field and uses `minHopPriceX36` for the multi-input array. These layouts cannot be substituted without verification.

**Unresolved:** the actual periphery gitlink and source compiled into the Polygon deployment. The discrepancy suggests stale lockfile evidence; it does not prove the deployed router or API is incorrect. Fetching GitHub gitlink metadata and Polygon verified-source metadata through the browsing tool was unavailable. The application routing/version policy has not changed. Do not guess an ABI or accept several layouts merely until one decodes.

## Next reproducible evidence

From `vezta-dex/`, run:

```bash
node scripts/smoke-router-provenance.mjs
```

The public-source-only probe reads the gitlink at the fixed router commit, compares the lock revision, and reports ordered V4 struct fields plus source SHA-256 fingerprints. It uses no environment file, API key, wallet, signature or RPC write. Paste its single JSON result; it deliberately reports `deployedSourceVerified: false` and `calldataValidated: false`.

Then match the actual source and compiler/dependency revisions to verified Polygon deployment metadata, implement the decoder, and verify real `/swap` response compatibility. Keep installed-wallet connection, exact approval receipt, quote refresh, signed preparation, account/state rechecks, simulation and small-swap receipt as separate remaining gates. Do not drop V4 or switch router versions without an owner decision.

## Verification

Account-gate tests first failed (12 regressions); the signature suite initially failed for the missing module. Focused checks then passed 71 tests and typecheck. The raw RPC contract test additionally proves that explicit empty code is preserved at the requested block. The provenance extractor tests failed for the missing module before implementation.

- `pnpm test`: **204 Vitest + 12 Node tests passed**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0. Existing React-detection and Next workspace-root warnings remain.
- `node --check scripts/smoke-router-provenance.mjs`: exit 0.
- The source probe in this sandbox returned only `NETWORK_UNAVAILABLE`; no live gitlink/deployment result is claimed.
- Fresh independent DEX review found **no Critical, Important or Minor findings** in the completed EOA/probe slice. The reviewer independently ran 72 focused Vitest + 4 Node tests. Decoder/preparation, real wallet signing/broadcast/receipts and deployed V4 provenance were excluded because they are not implemented or verified; they remain explicit gates.
