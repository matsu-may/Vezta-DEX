# EOA Swap Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a single-use, signature-verified Polygon swap without signing or broadcasting on the server.

**Architecture:** Check account code before exposing Permit2 signing data and again before preparation. Validate the unchanged saved message and signature, consume the quote once, request calldata through the shared limiter, decode every allowed command and simulate from the account. The UI remains read-only until live wallet gates pass.

**Tech Stack:** TypeScript, viem 2.47.18, Vitest, Node 24.

**Spec:** [Trading API swap](../../specs/2026-09-27-trading-api-swap.md), [approved EOA boundary](../../research/2026-09-28-swap-signer-boundary.md).

## Global Constraints

- Polygon 137; native USDC/WETH; exact input; CLASSIC; Universal Router 2.1.2; V4_NO_HOOKS.
- Exact ERC20 approval; unchanged PermitSingle, exact amount, maximum remaining 30 days / 30 minutes. Quote TTL is 30 seconds from request start.
- Only explicit empty account code is supported. No smart-account verification fallback or wallet signing by the backend.
- Reject unsupported executable compositions; never forward unknown effects. No automatic retries of signed `/swap` requests. Keep raw quotes/signatures/errors out of responses and logs.
- Pin router source to commit `802fe4c18f47300e0f183e2a42e9146ec2ea9fc3` and actual v4-periphery gitlink `545a5d2a87228167edde48f3b9eda122d1e3c4d6`, confirmed by the owner's host probe. The stale lock revision is not authority. Deployment verification remains required before exposing a prepared transaction.

## Review Focus

1. Malformed/missing code and EIP-7702 code block signing and preparation — Task 1.
2. Compact signatures, recovery bytes, changed messages and expired/concurrently consumed quotes fail safely — Tasks 1 and 3.
3. A valid router target with malicious extra commands, wrong recipients or weaker output bounds never passes — Task 2.
4. Exact allowance and nonce can change after the signing plan; recheck before preparation and simulation — Task 3.
5. API success, simulation success and a confirmed receipt are separate states; no UI writes are opened by unit tests — Task 3.

### Task 1: Account and signature boundary

**Files:** `apps/api/src/permit-reader.ts`, `chain.ts`, adjacent tests; new `permit-signature.ts` and test; `trading-api.ts`.

**Interfaces:** Add `PermitChainSource.getAccountCode(owner: Address, blockNumber: bigint): Promise<string>` returning the raw validated RPC hex. Add `verifyPermitSignature(data: Permit2Data, signature: unknown, owner: Address): Promise<Hex>` returning unchanged accepted bytes or throwing. Permit plans add `blocked-account` without typed data.

- [x] Write failing tests: nonempty/delegation/malformed code, pinned block, expiry during code read; signatures 64/65 bytes, wrong signer/message, zero/high-s, bad recovery byte, preserved bytes.
- [x] Run `pnpm exec vitest run apps/api/src/permit-reader.test.ts apps/api/src/permit-signature.test.ts`; observed 12 account-gate failures and missing signature module before implementation.
- [x] Implement raw `eth_getCode`, block before allowance/message access, off-chain EIP-712 recovery using viem. Request `generatePermitAsTransaction: false` explicitly.
- [x] Focused and full required checks passed: 204 Vitest + 12 Node, typecheck/lint/build. Fresh independent review of the completed EOA/probe slice found no findings; the boundary is committed separately from the unstarted decoder/preparer.

### Task 2: Router calldata policy

**Source gate passed; deployment gate remains open.** The owner supplied actual gitlink fields and source fingerprints. Implement the internal decoder against that single ABI, keeping it disconnected from wallet controls and transaction endpoints until deployment and live calldata checks pass. See [evidence and next gate](../../research/2026-09-28-eoa-signer-validation.md).

**Files:** New `apps/api/src/swap-calldata.ts` and test; ABI constants in `swap-abi.ts`; public deployment-evidence probe and extractor tests under `scripts/`.

**Interfaces:** `validateSwapCalldata(data: Hex, context: { intent, summary, permitData?, signature?, deadline: bigint, now: number }): void`. Accept canonical `execute(bytes,bytes[],uint256)` only. Bound dynamic array sizes before decoding, decode/reencode byte-for-byte; reject unknown commands and revert flags. Support explicit exact-input V2/V3 full paths and isolated hook-free V4 full paths paid by the wallet, direct wallet output or bounded final output sweep. Sum declared wallet input exactly; bound output in the same atomic transaction. Permit command must match the saved message and signature. Prefunding, router-balance/open-credit swap amounts and mixed-protocol chaining are unsupported until independently modeled; a zero V4 settlement/take amount maps the current full debt/credit, only in the isolated swap → settle → take shape.

- [x] Write failing tests for valid V2/V3/V4, split routes, permit mismatch, unsupported effects, weak minima, extra input spending, wrong recipient, missing deadline, old five-field ABI and malformed/trailing bytes.
- [x] Run `pnpm exec vitest run apps/api/src/swap-calldata.test.ts`; observe missing implementation.
- [x] Implement bounded canonical decoding and a conservative command/settlement whitelist grounded in pinned source. Unsupported mixed-protocol chaining stays rejected; quote previews remain available.
- [x] Focused checks passed 32 decoder tests and 4 deployment-extractor tests; full suite passed 236 Vitest + 16 Node tests, typecheck/lint exit 0.
- [x] Build exited 0; fresh independent review found no findings and independently passed 32 decoder + 4 extractor tests. Commit this slice as `feat(dex): validate Universal Router swap effects`.

**Deployment evidence gate before Task 3:** run `node scripts/smoke-router-deployment.mjs --save` on the host. Review the saved public artifact for runtime agreement, complete source/dependency graph, compiler configuration and immutable addresses. Two matching source fingerprints alone cannot close this gate. A missing or mismatched deployment stays unresolved; no executable endpoint is added while this gate is open.

**Scoped functional gate passed, 2026-09-28:** after the owner installed solc, actual host and local compiler runs reproduced all runtime bytes from the complete 110-source input, with 17 AST-derived immutable variables/40 references. Used swap configuration and both init hashes match official sources. Full historical Git-file mapping and separately retrieved deployment transaction remain unclaimed; SpokePool uses the release-author configuration attestation, not a retrieved full deploy script. Native, bridge and position commands remain rejected. See the research table for exact provenance; collector certification flags stay false. This permits the modeled unsigned preparation only; live calldata/wallet writes retain separate gates.

**Host evidence received:** 24,380-byte runtime matches RPC; both source fingerprints match; solc 0.8.26, optimizer 3000, viaIR/Cancun. All 110 source contents match metadata/input; runtime is reproduced exactly using 40 immutable replacements; creation matches after constructor arguments. Sourcify reports `match`, with `bytecodeHash: none`. **Owner selected A: independently recompile.** Task 4 below implements this additional gate before Task 3. See [decision and limits](../../research/2026-09-28-eoa-signer-validation.md#host-deployment-evidence-and-verification-decision).

### Task 4: Independent deployment rebuild (before Task 3)

**Files:** `scripts/router-rebuild.mjs`, `router-rebuild.test.mjs`, `rebuild-router-deployment.mjs`, package test command and evidence docs. Compiler installation/input/output/report remain in this plan's ignored workspace.

**Design:** Use exact npm `solc@0.8.26` in an isolated verification-tools prefix with install scripts disabled. No application dependency or environment key is required. Check compiler long version, source hashes and supplied settings; replace only compiler output selection to include AST. Compile all literal source inputs without import callbacks. Derive immutable values from the compiled AST, constructor fields and EIP-712 domain, then compare every runtime byte to the saved RPC snapshot. Unknown immutable names/scopes, duplicate/overlapping/out-of-range references, nonzero compiler placeholders and any bytecode mismatch fail closed. Separate successful recompile from the remaining official deployment-configuration check and live transaction gates.

- [x] Write failing tests for source/compiler/settings mismatch, bytecode mismatch, mutated constructor/runtime, unknown/duplicate immutable references and compiler errors. Observed missing module and later missing CLI behavior.
- [x] Implement source preparation and byte-for-byte reconstruction using locally compiled output; verify unchanged creation code and canonical constructor encoding. Twelve focused tests passed.
- [x] Add bounded local CLI, fixed artifact paths, generic errors, input/output digests and offline saved report. Real-artifact `--prepare` passed 110 sources; `--compile` returned controlled `COMPILER_NOT_INSTALLED`. No independent compiler success is claimed.
- [x] Attempt exact compiler installation: `ENOTFOUND registry.npmjs.org`. Host install/rebuild commands are documented; the evidence gate remains open.
- [x] Full tests passed 236 Vitest + 28 Node; typecheck/lint/build exit 0. Fresh independent review found no Critical/Important findings and one deferred Minor (report digests exclude the saved trailing newline). Commit the verification slice; Task 3 remains pending for host rebuild/config evidence.
- [x] Owner installed exact compiler; host rebuild passed at 16:36:28Z. Actual local recompile at 16:38:16Z reproduced identical evidence/compiler/input/output digests and creation/runtime matches. Scoped functional/configuration review recorded above; no live calldata or historical source-text certification.

### Task 3: Single-use preparation and verification

**Files:** New `swap-preparation.ts` and tests; `chain.ts`, `server.ts`, `main.ts`, `trading-api.ts`, research/spec/roadmap.

**Interfaces:** `SwapPreparer.prepare(intent: TradingIntent, quoteId: string, signature?: Hex)` returns only validated unsigned transaction, intent/expiry and simulation provenance. Extend chain source with balances, simulation and gas estimation at pinned blocks. `POST /api/v1/swap-preparation` accepts only intent, quote ID and optional signature. Share one `TradingApiClient` across quote and swap readers.

- [x] Write failing tests for valid saved payload, exact approval, balances/gas, stale/replayed/concurrent ID, signature, changed nonce/code, upstream failure/malformed payload, wrong transaction, failed simulation and HTTP secret suppression. Observed missing preparer/balance methods, followed by block-advance and cross-ID message-reuse regressions.
- [x] Implement validation/consume/upstream/decoder/local simulation with state rechecks. Shared quote/swap client; no signed retries or restore. New blocks trigger a bounded local resimulation/gas refresh. Owner/message digests reject cross-ID reuse until signature deadline.
- [x] Full `pnpm test`: 270 Vitest + 28 Node passed; `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0. Existing React-detection and Next workspace-root warnings only.
- [ ] Document deterministic evidence and remaining live calldata / installed-wallet / funded receipt gates. Record A in the parent plan and roadmap. Commit the slice.
- [ ] Obtain one fresh whole-change DEX review; fix Important/Critical findings with regression RED→GREEN, then rerun required checks. Keep browser writes disabled and do not merge/push.
