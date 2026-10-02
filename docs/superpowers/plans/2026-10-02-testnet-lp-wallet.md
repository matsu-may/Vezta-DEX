# Testnet LP wallet and assembled desktop demo implementation

Spec: `docs/superpowers/specs/2026-10-02-testnet-lp-wallet-design.md`.
Execution: continuous, bounded parallel layer work under dispatching-parallel-agents; root integrates and performs one final fresh review. Existing feature branch is authorized. Owner `next-env.d.ts` edit is preserved. No public signing, process killing, global configuration or repetitive historical rebuilds.

## 1. Core and backend LP lifecycle

Owner: backend implementer; `packages/core/src/testnet-lp-wallet*`, core index export, API LP wallet files/tests, API source/fee narrowly scoped additions, main route registration, disposable new LP wallet fork runner/script. Establish strict contract first and notify web implementer. RED tests for malformed intent, independent calldata decoding, funding/nonce/runtime/ownership, persisted context, immutable recheck, canonical receipt and dust. GREEN implement study/recheck/receipt with existing pinned reads/SDK and Jovian fees. Provide deterministic fixture exports for downstream browser tests. Do not sign public transactions. Existing fork helpers may be reused without rerunning historical gates.

## 2. LP wallet desktop control

Owner: web implementer; web LP wallet proxy/routes/controller/storage/schemas/UI/tests, demo/2 insertion. Consume core contract; coordinate cross-flow guard ownership with root. RED mock tests for action/rejection/reload/recovery/account change/safe acknowledgment. GREEN explicit reviews and independent wallet prompts, use same existing swap Web Lock; own LP slot. Add browser fixture and smoke lifecycle script (all requests mocked; no real wallet). Submission gated by existing opt-in. Do not edit global CSS/demo navigation (assembly owner), API or core.

## 3. Assemble Explore and detail

Owner: assembly implementer; demo/3 and demo/4 pages, curated discovery component/tests, demo navigation component and demo/1 navigation, global CSS additions. Reuse existing read-only testnet discovery endpoint/core report, selected fee3000 pool only. Live labels, explicit refresh, missing/stale states, provenance, pool/token addresses and useful swap/LP links. No fake metrics. Do not edit demo/2 or LP wallet files. Provide mocked desktop navigation smoke and screenshots if safely possible; no owner browser.

## 4. Integrate, qualify, document

Owner: root; reciprocal cross-flow recovery guard in swap and LP, unit regression. Inspect produced contracts/endpoints and any Node runtime dependency assumptions. Run focused then final full quality gates; save owner next-env edit before build and restore. One fresh scoped security/cross-layer reviewer; fix meaningful findings and rerun only affected gates. Run the new disposable wallet LP fork once after readiness, or report concrete unavailable environmental gate. Inspect desktop screenshots. Update roadmap and owner guide/checkpoint with exact done/pending distinction and sequential faucet/MetaMask instructions. Commit scoped changes locally; no merge/push. Preserve complete ledger and decisions for resumption.
