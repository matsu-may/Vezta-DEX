# Testnet Product Completion Roadmap

## Scope and authorization

**Owner clarification, 2026-10-06:** complete the standalone DEX task on testnet.
Do not stop at a Base demo or treat phases 7–8 as optional follow-ups. Use the
[task acceptance criteria](../../specs/2026-10-06-testnet-task-acceptance.md)
as the final exit contract. Existing implemented slices and historical wallet
acceptance remain valid; unresolved proofs and new-chain work remain open.

The owner approved saving and executing this roadmap on 2026-10-04. Continue
independently with reversible code/configuration choices; stop for wallet signatures,
external publication, or a material product/chain choice that evidence cannot settle.
Keep the standalone desktop app, launchpad branding, Base Sepolia and user signing.
Frontend-only Vercel visual acceptance is owner-confirmed; it is not hosted API acceptance.
Existing public-testnet swap/LP/recovery acceptance is owner-reported. Preserve it.

## Ordered phases and estimates

Estimates cover active implementation and verification, excluding owner/network waits.

| Phase | Steps | Estimate | Exit |
|---|---|---|---|
| 1. Progress | 1.1 inventory (0.5–1h); 1.2 reconcile docs (0.5–1h) | 1–2h | One consistent current checklist |
| 2. Inputs | 2.1 bounded amount/slippage design (0.5–1h); 2.2 UI/core/API (1–2h); 2.3 invalidation/tests (0.5–1h) | 2–4h | Exact integer amounts and intent-bound minimum |
| 3. CLMM range | 3.1 range/price orientation (1–2h); 3.2 SDK math/UI/calldata (3–5h); 3.3 boundary/fork checks (2–3h) | 6–10h | Reviewed price range matches ticks and mint |
| 4. Explore | 4.1 pool qualification (1–2h); 4.2 list/filter/detail/selection (2–4h); 4.3 errors/navigation (1–2h) | 4–8h | Read/executable eligibility distinguished |
| 5. Activity/fees | 5.1 account+chain history (2–4h); 5.2 receipt fee reporting (1–2h); 5.3 reload/accounting tests (1–2h) | 4–8h | Original hashes retained; estimates distinguish actual costs |
| 6. Release | 6.1 review/quality gates (1–2h); 6.2 evidence/docs (0.5–1h); 6.3 release/video guide (0.5–1h) | 2–4h | Reproducible desktop testnet handoff |
| 7. Routing | 7.1 scope/criteria (1–2h); 7.2 direct-pool comparison (3–6h); 7.3 simulation/receipt tests (2–4h) | 6–12h | Each selectable execution pool independently qualified |
| 8. Second chain | 8.1 deployment/liquidity feasibility (1–3h); 8.2 adapter (3–5h); 8.3 wallet/recovery qualification (2–4h) | 6–12h | Independent executable testnet chain |

Milestone 1 (phases 1–6): **19–36h**. Milestone 2 adds **12–24h**;
total **31–60h**. Mobile, mainnet, backend hosting and main Vezta integration
remain separate. Discovery on another chain does not prove multi-chain execution.

## Execution rules

- Implement natively in an isolated branch; focused RED/GREEN tests per behavior,
  one full checkpoint run after the group, fresh whole-change review.
- Preserve old recovery contexts and default full-range mint intents.
- Preserve existing maximum demo sizes (5 USDC / 0.001 WETH swap; LP caps unchanged).
  New positive integer amounts within caps still require live depth/simulation.
- Slippage defaults to 50 bps; permit integer 5–100 bps. Bind the selected value
  into quote, minimum, review, calldata, recovery and final recheck.
- Custom mint range must use valid spacing-60 ticks; show **USDC per WETH** prices,
  actual snapped bounds and single-sided requirements. Existing positions retain
  their own range on increase. Never infer a user investment strategy.
- Discovery may list observed pools read-only. Do not activate an unverified
  pool or silently substitute the accepted router/pool.
- Activity is a local observed history, not a complete chain indexer. Keep active
  recovery locks separate; show estimated vs actual fees and relayer gas payer.
- Record missing public hashes/fee fields as unknown; do not manufacture evidence.

## Checklist

- [x] Phase 1: current-state documentation reconciled; latest checkpoint overrides dated historical pending statements.
- [x] Phase 2: flexible amounts/slippage implemented; integer/calldata/UI checks pass. New public wallet acceptance pending.
- [x] Phase 3 implementation: custom-range LP implemented; SDK comparison, intent/calldata/boundary/UI checks pass. Two custom-range fork attempts reached exact approvals but mint gas estimation timed out; successful custom-range fork/public receipt evidence remains pending.
- [x] Phase 4: multi-pool discovery and eligibility/navigation verified; separately proven curated swap pools are enabled only through fresh qualification; LP remains 0.3%.
- [x] Phase 5: local activity and fee presentation verified. L2 actual costs remain distinct from estimated total budgets; complete charged L1/operator fees are still unqualified.
- [ ] Phase 6: independent review and local quality gates passed; delta acceptance/release handoff must be closed by owner before marking the milestone complete.
- [x] Phase 7 implementation: four pool runtime proofs, bound direct comparison/selection, fork and browser checks passed. Owner new-pool public receipt acceptance remains pending.
- [ ] Phase 8: Ethereum/Unichain feasibility measured; explicit owner chain choice and independent execution adapter still required.

## Owner checkpoints

The owner's latest preference is **one consolidated acceptance pass at the end**.
The per-phase checks below describe its coverage, not requests to test after each
implementation session. Extend the existing delta guide to include the second
chain after its adapter is qualified; do not ask the owner to rerun accepted
compiler/fork diagnostics.

After phase 2: one small custom amount/slippage swap. After phase 3: one small
custom-range mint and position read/decrease/collect. After the group: new UI,
activity/reload and any affected flows only. An unverified original transaction
keeps its context/hash; do not resend. Never request keys or recovery-file contents.

## Checkpoint 2026-10-05

Implementation and delta owner guide are recorded in
`docs/research/2026-10-05-testnet-product-owner-guide.md` and the progress ledger.
Phase 7 preparation selected direct qualified pools under the existing router;
pool source/template reuse does not waive per-address immutable/runtime proofs.
Phase 8 requires a measured second-chain qualification and the explicit owner choice.

## Checkpoint 2026-10-06

The [final independent check plan](2026-10-06-final-independent-checks.md) adds
custom-range fork coverage, a bounded fee evidence CLI and shared read transport.
The [progress report](../../research/2026-10-06-independent-checks-progress.md)
records actual passes and the unresolved mint estimate timeout. Do not repeat
independent diagnostics as owner acceptance steps. Use the single delta guide
once; defer second-chain activation until the owner chooses it. Complete charged
fee accounting is not claimed from partial receipt fields.
The old Base Sepolia acceptance remains accepted; test only the changed behaviors.

Phase 7 execution/evidence: `2026-10-05-direct-pool-routing.md` and
`../../research/2026-10-05-direct-pool-routing-evidence.md`. Phase 8 measured
options: `../../research/2026-10-05-second-testnet-feasibility.md`.
