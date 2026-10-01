# Testnet source evidence progress and host checks

## Latest host evidence and compatibility fix

The owner saved the five-contract Base Sepolia snapshot at block **47551649**, hash `0x6e9613b1be29ccae55e672d71c330c94d814214af1d9dfa04339959d023a5803`, observed `2026-10-01T16:19:46.000Z`. All four live snapshot checks passed. The saved file was read locally and its full inventory, package fingerprints, code hashes and exact-match flags passed the existing snapshot validator. That offline check used a source fixture solely to exercise snapshot validation; it provides no live source/rebuild proof. No router source cache existed.

The owner's source command returned `SOURCE_EVIDENCE_INVALID`. Agent public-source lookup failed `SOURCE_NETWORK_UNAVAILABLE`, so the exact live rejection remains unobserved. Research identified a confirmed compatibility defect: the [official Sourcify OpenAPI](https://sourcify.dev/server/api-docs/swagger.json) allows standard-JSON source entries with both `content` and `keccak256`; the validator previously rejected any second field. Matching optional hashes are now accepted only after binding them to metadata and independently hashing literal content. Remote URLs, unknown fields, incorrect/null/non-string hashes and the existing size bounds still fail. Normalization retains literal content plus independently checked metadata hashes; execution flags remain false.

Validation errors now include a fixed `stage`: `artifact`, `identity`, `compiler`, `target`, `source-graph`, `source-content`, `runtime`, or `snapshot`. No source text, compiler settings, rejected field values or credentials are emitted. A transport/JSON failure before validation may have no stage. The stage is diagnostic, not a permission to bypass checks.

**Next host action:** with the saved snapshot already present, run only `pnpm testnet:source-evidence --save` and share the bounded JSON output. A successful result needs `sourceGraphValidated:true`, `snapshotAvailable:true`, `runtimeSnapshotMatches:true` and `evidenceSaved:true`; all rebuild/runtime/execution flags remain false. If it fails, the stage narrows the investigation. Do not delete evidence or change deployment addresses to make the check pass. No alternative architecture is selected on this incomplete evidence.

TDD observed: stage diagnostics failed 9 cases before implementation, then the focused suite passed 36 tests; optional-source-hash acceptance failed at `source-content` before the compatibility fix, then the focused suite passed 37 tests. The actual cached CLI is also exercised with a hashed source entry. Final gates after this fix: `pnpm test` passed (616 Vitest +85 Node), typecheck/lint/build and diff check passed. The first broad run alongside typecheck/lint hit the existing snapshot CLI test's 10-second subprocess limit (`sanitizes provider failures and rejects unsupported CLI options before network access`); that test passed alone in 1.338 seconds and the unchanged full suite passed when rerun without competing typecheck/lint. An inference error in the new table-driven test was corrected with an explicit unknown-returning fixture type. No production timeout or test budget was increased. Existing workspace-root/React-version warnings remain.

## Delivered slice

Compiler-input acquisition is prepared for the five pinned artifact roles, one explicit contract per invocation; router is the default. The CLI requests only needed fields from the [Sourcify v2 lookup](https://docs.sourcify.dev/docs/api/), caches validated public payloads and reuses them. It does not install a compiler, clone contracts, submit verification jobs, read `.env`, sign, broadcast or change API/web behavior.

Pure validation binds chain/address, provider match, compiler version and compilation target. Every literal source is checked against its metadata keccak256; remote imports, altered/missing graphs and oversized content fail closed. Settings are preserved; only outputSelection is replaced to request selected bytecode/metadata and AST for later immutable mapping. Source paths remain keys in JSON, never filesystem destinations.

If saved runtime evidence exists, all five roles/addresses/package hashes/code hashes/exact-match flags and block identity/times are revalidated before the selected source-provider runtime is compared byte-for-byte. An absent snapshot is allowed for source acquisition; a mismatch or malformed snapshot stops qualification. This is historical consistency, not fresh execution approval.

## Verification observed

- RED preceded graph, transport and file implementations. Source graph tests passed; transport tests cover fixed GET fields, 8 MB streaming cap, UTF-8 boundary, hung/late responses, sanitized HTTP errors and no retry.
- Actual CLI integration uses an isolated temporary checkout, real cache files and a network guard. A cached-null regression failed before the branch fix; invalid cached data now stops before any network call. Leaf symlinks/non-regular files and overgrowth are rejected; atomic publication preserves prior cache on failure.
- Final full suite: 607/607 Vitest +85/85 Node; typecheck, lint, build and git diff --check passed. Existing React-version detection and Next.js workspace-root warnings remain; no configuration changes were made for those warnings.
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

## Final independent review and decisions

One fresh gpt-6.1-sol high review found no Critical/Minor findings and one Important finding: a symlinked evidence directory redirected reads/publication outside the cache. The single fix pass rejects a symlink/non-directory before each read, snapshot read, publication and cleanup; trailing URL slashes are normalized before lstat. Four real-directory replacement tests failed first, then passed with external source/snapshot/sentinel bytes unchanged. Full gates above were rerun after the fix. Local checkout parents remain trusted; this CLI is not a sandbox against another local process concurrently replacing directory entries.

No deferred minors in this slice. Earlier artifact review notes remain in their own progress record. No live compilation/runtime qualification is claimed, and this review is not a contract audit.

### Rulings I made (chronological)

- Continue evidence acquisition without waiting for an owner snapshot — source graph preparation does not require signing or runtime promotion and owner authorized autonomous choices — cost: no live runtime qualification can be claimed until host evidence arrives.
- Collect one explicit role per invocation and reuse saved validated payloads — respect Sourcify single-contract lookup and avoid repeated bulk source requests — cost: other contract evidence requires a separate invocation later.
- Exercise the actual CLI in an isolated temporary checkout with a network guard — cached null must not trigger a source fetch; the regression failed SOURCE_NETWORK_UNAVAILABLE then the branch was changed to fetch only absent data — cost: temporary copies/symlink test harness and real subprocess startup.
- Reject symlinks and non-regular cache files and enforce byte limits during reads — cached JSON is untrusted and must not read alternate targets or grow past its cap — cost: symlink-based caches are unsupported.
- Use available gpt-6.1-sol high for the one fresh whole-slice review — the higher model previously hit its usage limit — cost: judgment uses the available reviewer model.
- Retain the local feature branch and owner next-env change — existing standalone/autonomous authorization covers these implementation commits, not publication — cost: remote CI remains unobserved and one owner diff remains unstaged.
- Independent compilation, immutable mapping, fresh runtime qualification, simulation, signing and API/UI execution remain later gates — source acquisition gives reusable compiler inputs, not execution approval — cost: phase 2 and the full demo remain incomplete.
- Live source availability and actual response compatibility remain unqualified — offline fixtures and guarded CLI tests prove local handling, while DNS/network failures prevented a real payload — cost: owner host evidence may reveal a provider compatibility gap.
- Reject a linked evidence directory before every operation, preserving leaf guards — fixed local cache paths must not read or overwrite external files — cost: linked cache directories are unsupported; trusted checkout parents and no hostile concurrent directory replacement are assumed.
