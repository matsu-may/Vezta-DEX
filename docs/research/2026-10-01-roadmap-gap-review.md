# Roadmap Gap Review — 2026-10-01

**Scope:** Independent `vezta-dex` first. No main Vezta integration, public wallet writes, deployment or mobile visual acceptance is authorized by this review.

## Corrections to the delivery sequence

1. **Multi-chain scalability needs a standalone milestone.** Polygon remains the first chain; the second chain is selected from user demand and measured pool depth. Chain ID must key tokens, pool identity, router/manager addresses, RPC, quote/replay records, fee data and finality. Same-chain swaps come first. Cross-chain transfer is a separate future flow.
2. **Local fork and hosted LP API have different evidence.** The owner verified local Anvil exact approvals, mint simulation, NFT identity and balances at Polygon block `94738685`. This proves wiring against a fork, not hosted API support for later actions. Its NFT does not exist on Polygon. Qualifying hosted `increase`, `decrease` and `claim_fees` requires an owner-controlled Polygon NFT and separately decoded, bounded, simulated payloads.
3. **LP accounting needs explicit principal/fee rules.** In v3, decreasing liquidity accrues owed token amounts; collection transfers them. The LP API may bundle collection with decrease. Review emitted events and wallet deltas to avoid counting the same fees twice. Treat displayed fee estimates as estimates; actual receipt and balances govern completion. Do not derive APR or USD TVL from raw liquidity.
4. **Exact approvals can leave residual allowance.** After each LP write, read both manager allowances and compare against actual spend. Specify finite residual handling before another create/increase; reject unlimited approval payloads. Recheck owner, chain, ticks, liquidity, balances, allowance, nonce, quote freshness and simulation immediately before a write.
5. **LP recovery needs its own state machine.** Handle rejection, uncertain submission, replacement, delayed receipts, reorg and indexer lag without automatic rebroadcast. Present the original hash and read-only reconciliation before another action.
6. **Public release needs operational gates.** Direct preparation endpoints need access control and quotas; process-local quote/replay/rate state cannot serve multiple instances without coordination. Add readiness and sanitized latency/error telemetry for Polygon RPC, Trading API and LP API. The owner's 6 RPS limit is established for Trading API only; LP API quota is still unknown. Remote CI and deployment/rollback remain unobserved.

## Next independent slice

Rehearse direct v3 manager increase, partial/full decrease, collect and close on the **same disposable Anvil fork** after the verified mint. Check owner, liquidity, owed token state, exact approval residue, wallet deltas and receipt outcomes. This contract-level check is separate from future hosted LP API payload qualification. The owner can run the completed local harness without funding or signing with a real wallet.

After that, continue desktop position economics and release-control work. Leave mobile visual review until the end of the complete standalone product. Keep both public swap and LP writes disabled until their respective live evidence and release gates pass.
