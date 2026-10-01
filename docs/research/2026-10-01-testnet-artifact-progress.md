# Testnet artifact and deployment evidence progress

## Delivered

The owner installed exact verification devDependencies: `@uniswap/swap-router-contracts@1.1.0`, `@uniswap/v3-core@1.0.0`, and `@uniswap/v3-periphery@1.0.0`. Preserve the router package's separate transitive periphery 1.3.0. These modules are offline/read-only CLI tooling, with no imports into API routes or browser code.

`pnpm testnet:artifacts` passed. Five installed JSON fingerprints are pinned in `apps/api/src/testnet-artifacts.ts`; changed package versions, bytes or identities fail closed. SwapRouter02 uses its seven-field swap tuple and deadline multicall. QuoterV2 comes from the router package. Both canonical swap encodings match the real artifact ABI; input order/types and function mutability are checked independently of the handwritten ABI.

| Role | Package release | Artifact runtime bytes |
|---|---|---:|
| Router | swap-router-contracts 1.1.0 | 24,497 |
| QuoterV2 | swap-router-contracts 1.1.0 | 8,273 |
| Factory | v3-core 1.0.0 | 24,535 |
| Pool | v3-core 1.0.0 | 22,142 |
| NFT manager | v3-periphery 1.0.0 | 24,384 |

Artifacts have no immutable-reference table/build information. ABI compatibility and artifact hashes do not prove deployed source. The new snapshot reader checks Base Sepolia 84532, nonempty bounded code for all five addresses at one fresh block, and the final block hash. It uses existing paced RPC reads and a 25-second abort budget; it never masks bytecode differences or enables execution. The shared RPC transport now bounds the decoded response stream at 1 MiB before JSON parsing and cancels overflow, including missing or misleading Content-Length.

## Verification observed

- Meaningful failing tests preceded the loader, snapshot and evidence-file implementations. Focused artifact/snapshot/persistence tests: 13 passed. Final suite: 579 Vitest +85 Node passed; typecheck, lint and build passed.
- Offline artifact CLI passed with both canonical checks true and `runtimeVerified:false`, `executionEnabled:false`.
- Agent live snapshot attempt failed at `getChainId` after 104 ms with a transport error, reported as `TESTNET_DEPLOYMENT_RPC_UNAVAILABLE`. No live bytecode evidence was obtained or saved; this is not a failure of the owner's previously qualified provider.

## One owner check — no wallet or test funds needed

From `vezta-dex`, with the working `BASE_SEPOLIA_RPC_URL` in `apps/api/.env`:

```bash
pnpm testnet:deployment-snapshot --save
```

No dev server is needed. Expected: `status:testnet-deployment-snapshot-read-only`, chain 84532, all four `checks` true, five contract summaries, and `evidenceSaved:true`. `artifactRuntimeExactMatch` may be false because immutable values or other compilation differences require further verification. `independentRebuildVerified`, `runtimeVerified`, and `executionEnabled` must still be false, even if every exact comparison is true.

Public code/block evidence is saved locally at ignored `.local-evidence/base-sepolia-deployment.json`. Only `--save` replaces the previous latest snapshot; a failed refresh clears that old latest file, while a run without `--save` preserves it. Share the bounded command output, never the RPC URL/API key. If it fails, share only `code` and `rpcDiagnostics`; there is no need to repeat the successful wallet quote/state checks.

## Next gate

Use the saved evidence to qualify source/compiler settings and immutable/dependency values through reproducible compilation. Then implement gas/simulation and executable preparation, wallet submission/receipt recovery, and the testnet LP lifecycle. Phase 2 remains incomplete; no public-testnet transaction was signed or broadcast in this slice.

## Independent review and fix evidence

One fresh reviewer inspected the entire slice and independently passed the 13 focused tests. The Important finding was pre-validation HTTP buffering: the reader's code-size limit did not protect transport memory. Three streaming-overflow regressions failed first, then passed after bounded stream consumption/cancellation; a valid response at the exact limit also passes. Focused transport/pacer/diagnostic tests passed 18/18, followed by the green full suite and other quality gates. No second review was dispatched.

One full run failed only on the real CLI subprocess test's default 5-second Vitest budget; the correct subprocess took 6274 ms under parallel load. That test now has a 15-second harness budget around the unchanged 10-second subprocess bound. Production RPC/study deadlines are unchanged. The final full run passed 579/579 Vitest and 85/85 Node.

**Deferred minor:** the artifact Quoter check uses a duplicated expected ABI rather than importing the adapter's ABI. Current interfaces and the adapter's independent tuple/output test agree; future adapter drift could escape the artifact CLI check. This is recorded for a later focused maintenance slice.

## Decisions retained from the execution ledger

- Ruling: Treat the owner-installed devDependencies and lockfile as authorized artifact acquisition inputs — the owner executed the exact proposed install — cost: legacy router development dependencies enlarge the lockfile; they remain verification-only.
- Ruling: Record package/fingerprint/ABI checks separately from deployed-source proof — immutable-reference/build information is absent from npm artifacts — cost: runtime verification and execution stay gated pending further evidence.
- Task 1: Ruling: Ignore cosmetic ABI return names, but check return types, input names/order/types and mutability — the deadline multicall artifact has unnamed output where the handwritten ABI names results — cost: harmless output-label renames are not treated as incompatibility.
- Task 2: Ruling: Isolate atomic evidence persistence in a small file owner with unique temporary paths — exercise real file effects in disposable directories and avoid deleting other CLI temporary files — cost: an additional helper/test file.
- Task 2: Ruling: Clear the prior latest snapshot before an explicit --save refresh and publish atomically only after all checks — prevent failed refreshes appearing as new proof — cost: that command replaces the previous latest evidence rather than retaining a history.
- Final: Ruling: Use the available gpt-6.1-sol high fresh reviewer — the gpt-6-astra reviewer previously failed due to a usage limit — cost: final judgment uses the available model rather than the unavailable higher model.
- Final: Ruling: Keep the existing feature branch locally under the owner's standing standalone-work authorization — no integration or publication was requested — cost: remote CI and shared-branch review remain unobserved.
- Final: Ruling: Keep live deployment/source/rebuild qualification explicitly open — the agent transport failed and no owner runtime snapshot exists — cost: executable preparation remains blocked on real evidence.
- Final: Ruling: Leave wallet execution, simulation, gas qualification and LP lifecycle to later implementation slices — current tools provide read-only provenance preparation only — cost: this slice is not a complete public-testnet demo.
- Final: Ruling: Preserve the owner's existing next-env.d.ts diff outside the reviewed/staged range — it is dev-server output predating this slice — cost: the checkout intentionally retains one uncommitted owner change.
- Final: Ruling: Defer comprehensive audit of every legacy transitive dependency — packages are pinned and verification-only, and tests/import isolation were checked — cost: no complete dependency security assurance is claimed.
- Final: Ruling: Bound decoded HTTP response streams at 1 MiB, reject even misleading/missing Content-Length, and cancel on overflow — prevent pre-validation buffering from defeating the runtime-code limit — cost: a larger legitimate RPC response fails closed and needs explicit budget reassessment.
- Final: Ruling: Give the real CLI subprocess test a 15-second harness budget around its existing 10-second spawn bound — a full run timed out at Vitest's default 5 seconds while the correct subprocess finished after 6274 ms under parallel load — cost: this one test may take longer; production RPC/study deadlines remain unchanged.

Implementation commits: `cd98f68` (artifact/ABI), `71fea1a` (snapshot/evidence). The final scoped fix commits the transport byte bound and review record. The owner's existing next-env change remains unstaged.
