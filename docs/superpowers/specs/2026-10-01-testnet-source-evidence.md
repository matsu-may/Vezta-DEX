# Base Sepolia source evidence acquisition

## Purpose and boundary

Continue the accepted dependency strategy: collect compiler input for the five curated Uniswap deployments, starting with one explicitly selected contract per invocation. This prepares independent compilation while host runtime evidence is unavailable to the agent. No compiler/dependency installation, source checkout, transaction, API route or UI change belongs to this slice.

Use the [Sourcify v2 contract lookup](https://docs.sourcify.dev/docs/api/) with only `metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode`. Its [OpenAPI contract](https://sourcify.dev/server/api-docs/swagger.json) supplies default chain/address/match fields. No enumeration, bulk loop, verification POST, arbitrary host, fallback or retry. Send a descriptive user agent; cache successful saved responses and reuse them.

## Validation and outputs

Role is router/quoter/factory/pool/manager from the existing pinned artifact manifest; default router. Require chain 84532, exact address, provider runtime match `match` or `exact_match`, nonempty even runtime hex ≤65,536 bytes, Solidity language, and equal metadata/compilation compiler versions matching `0.x.y+commit.<8 hex>`.

Require exactly one metadata compilation target with the manifest contract name and source path equal to or ending in its recorded sourceName. Compiler input must contain that target, literal sources only, identical source keys to metadata, and each content's keccak256 must match metadata. Bound graph to 200 sources, ≤4,000,000 UTF-8 source bytes, path length ≤512, and reject NUL/prototype keys. Preserve compiler settings/remappings/libraries. Change only outputSelection to request AST plus selected contract metadata, creation/deployed bytecode and immutable references. Do not execute imports or use provider replacements/recompiled output.

Persist a normalized allowlist payload, revalidate cached data on every read, and compute the prepared input SHA256. A saved deployment snapshot is optional for acquisition; if present, validate the complete five-role snapshot against installed artifacts and recomputed code hashes before comparing the selected provider runtime byte-for-byte. A mismatch fails closed. Historical snapshot consistency is not a fresh execution gate.

Summary contains role/address/compiler/source counts/input and runtime hashes, snapshot availability/match, and literal false independentRebuildVerified/runtimeVerified/executionEnabled. No raw source/code, provider URL, credentials, wallet or transaction appears in stdout.

## Resource and persistence rules

Public lookup: 15-second abort/race budget and streaming 8,000,000-byte response cap including absent/misleading Content-Length; no retry. Sanitize timeout/HTTP/transport/invalid data errors. CLI accepts only `--role <role>` once and `--save` once. No `.env` read.

`--save` publishes a validated payload atomically to ignored `.local-evidence/base-sepolia-source-<role>.json`, using its own unique temporary file. Existing valid saved payloads are reused even without --save; invalid cached files stop with a bounded error. No existing snapshot or other role's evidence is removed. Local reads: source file ≤8 MB, snapshot ≤1 MB; reject overgrowth during read too. An absent snapshot produces snapshotAvailable:false, not a claim of runtime matching.

## Qualification remaining

Observed installed ABI compatibility remains distinct from source graph consistency, historical runtime binding, independent local compilation/immutable mapping, dependency configuration and successful simulation. All remain required before executable preparation. A missing/unsupported Sourcify record is an evidence gap needing a separately researched acquisition path, never guessed settings or silently weakened verification.
