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

Artifacts have no immutable-reference table/build information. ABI compatibility and artifact hashes do not prove deployed source. The new snapshot reader checks Base Sepolia 84532, nonempty bounded code for all five addresses at one fresh block, and the final block hash. It uses existing paced RPC reads and a 25-second abort budget; it never masks bytecode differences or enables execution.

## Verification observed

- Meaningful failing tests preceded the loader, snapshot and evidence-file implementations. Focused artifact/snapshot/persistence tests: 13 passed. Full suite: 575 Vitest +85 Node passed; typecheck, lint and build passed (final review recorded below when complete).
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
