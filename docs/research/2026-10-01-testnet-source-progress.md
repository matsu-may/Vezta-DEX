# Testnet source evidence progress and host checks

## Delivered slice

Compiler-input acquisition is prepared for the five pinned artifact roles, one explicit contract per invocation; router is the default. The CLI requests only needed fields from the [Sourcify v2 lookup](https://docs.sourcify.dev/docs/api/), caches validated public payloads and reuses them. It does not install a compiler, clone contracts, submit verification jobs, read `.env`, sign, broadcast or change API/web behavior.

Pure validation binds chain/address, provider match, compiler version and compilation target. Every literal source is checked against its metadata keccak256; remote imports, altered/missing graphs and oversized content fail closed. Settings are preserved; only outputSelection is replaced to request selected bytecode/metadata and AST for later immutable mapping. Source paths remain keys in JSON, never filesystem destinations.

If saved runtime evidence exists, all five roles/addresses/package hashes/code hashes/exact-match flags and block identity/times are revalidated before the selected source-provider runtime is compared byte-for-byte. An absent snapshot is allowed for source acquisition; a mismatch or malformed snapshot stops qualification. This is historical consistency, not fresh execution approval.

## Verification observed

- RED preceded graph, transport and file implementations. Source graph tests passed; transport tests cover fixed GET fields, 8 MB streaming cap, UTF-8 boundary, hung/late responses, sanitized HTTP errors and no retry.
- Actual CLI integration uses an isolated temporary checkout, real cache files and a network guard. A cached-null regression failed before the branch fix; invalid cached data now stops before any network call. Symlinks/non-regular files and overgrowth are rejected; atomic publication preserves prior cache on failure.
- Full suite: 603 Vitest +85 Node, typecheck/lint passed; build and final independent review are recorded below when complete.
- This session retried runtime acquisition: `getChainId` failed after 41 ms with bounded transport diagnostics. Source acquisition returned `SOURCE_NETWORK_UNAVAILABLE`; a separate public GitHub GET failed DNS resolution. No live source/runtime payload was acquired or saved. Existing owner quote/state evidence remains valid historical evidence.

## Two host commands — no wallet, tokens or dev server

Run from `vezta-dex`:

```bash
pnpm testnet:deployment-snapshot --save
pnpm testnet:source-evidence --save
```

The first uses your working `BASE_SEPOLIA_RPC_URL` in `apps/api/.env`, saves the five-contract snapshot and should show chain 84532, all four checks true and `evidenceSaved:true`. See the [snapshot runbook](2026-10-01-testnet-artifact-progress.md) for details.

The second uses the public source service, default router, and needs no API key. Expected: `status:testnet-source-evidence-read-only`, `role:router`, `sourceGraphValidated:true`, compiler version/target and positive source counts, `evidenceSaved:true`. After a successful first command, `snapshotAvailable:true` and `runtimeSnapshotMatches:true` are required. Without a snapshot, `snapshotAvailable:false`/`runtimeSnapshotMatches:null` is valid acquisition but leaves runtime binding open.

**All three remain false:** `independentRebuildVerified`, `runtimeVerified`, `executionEnabled`. A graph/provider match is not independent compilation. Share only the bounded JSON outputs. A 404/source mismatch/timeout is a gate failure to investigate, not a reason to change routers or accept guessed compiler settings.

Files stay ignored at `.local-evidence/base-sepolia-deployment.json` and `base-sepolia-source-router.json`. Successful source caches are reused (`cached:true`) without another lookup. Invalid caches fail closed; report the bounded error before deleting/replacing anything. Snapshot refresh policy remains unchanged.

Other supported roles can be selected individually later, e.g. `pnpm testnet:source-evidence --role quoter --save`. Do not run a bulk loop or request all provider fields. Begin with the router result so compiler/source compatibility can be assessed before additional acquisition.

## Remaining work

Qualify actual compiler version/settings, install the exact verification compiler only when observed, independently compile, map every immutable/library from validated configuration/constructor evidence and compare all runtime bytes. Then gas/simulation, executable preparation, wallet submission/recovery and LP follow. Phase 2 remains incomplete and the complete testnet demo is not yet accepted.
