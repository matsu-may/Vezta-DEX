# Base Sepolia funded fork lifecycle

## Accepted host evidence

Owner oracle probe: chain 84532, block 47566198 /2026-10-02 00:24:44 UTC, Jovian, L1 upper estimate 6635597420 wei, operator fee successfully zero, reference budget 733271194840 wei. This qualifies model access, not a real transaction's gas/charged fee.

Owner unsigned prepare probes passed both unfunded paths: USDC→WETH at 47566220 /00:25:28 UTC and WETH→USDC at 47566228 /00:25:44 UTC. Runtime/quote binding verified; insufficient input/native funding blocked simulation and transaction production. These checks are complete; no repeat required.

## Selected next group

Use the existing quote/approval/swap readers and canonical deployment pins in one disposable Anvil fork rehearsal. No frontend, public executor, dependency update or contract deployment. One command owns startup, fixture funding, reset/exact approval, bidirectional swaps, receipt reconciliation and cleanup. The owner's standing authorization covers routine choices and local fork mutations; no owner signature or real asset is used.

Only an owned loopback HTTP Anvil transport on chain 84532 may mutate state. Check origin, transport URL, client version and chain before writes. Fork a fresh canonical upstream block; verify its hash locally. Fund a fixed public fixture EOA with local ETH, borrow 1 test USDC from the forked pool and wrap local ETH for WETH. This perturbs a disposable fixture, not public liquidity; snapshot/revert and stop the child in finally paths.

Exercise a nonzero USDC allowance reset, confirm/reread zero, then exact approvals and USDC→WETH /WETH→USDC. Use fresh quotes and original minimum/deadline, existing funded simulations/complete snapshot fees, nonce/allowance/hash/freshness pre-send checks and synchronous quote consumption. Every action reconciles original sender/target/calldata/nonce, canonical two-confirmation receipt, token events/balance deltas, gas and remaining allowance.

Anvil's gas charge is local L2 accounting. Reading the forked fee oracle does not prove public Base L1/operator charges or wallet compatibility. A fork result is not public testnet acceptance, a browser submission recheck API, or production permission. Execution stays disabled in the product.

## Implementation and verification checklist

- [x] RED tests for local transport restrictions and strict receipt/token/allowance/gas reconciliation; send-boundary and snapshot cleanup tests also exercised missing-module RED→GREEN.
- [x] Implement guarded fork helpers, lifecycle and owned-child CLI with bounded diagnostics/cleanup.
- [x] Focused tests and one final full suite/typecheck/lint/build gate; fresh independent review and Important clock fix confirmed.
- [x] Accept owner funded EVM evidence at block 47573721 after the agent upstream attempt failed.
- [x] Record results and one host handoff; no repeat of accepted oracle/unfunded probes.

Prior scope: [fee/preparation progress](2026-10-02-testnet-fees-swap-preparation-progress.md). Delivery phases: [roadmap](../superpowers/plans/2026-10-01-standalone-testnet-completion.md).

## Current execution evidence

**Accepted owner EVM run:** `pnpm testnet:fork` passed at upstream block **47573721**. Reset plus exact USDC approval, exact WETH approval, both simulated swaps and canonical two-confirmation receipts passed. Forward spend/output: **1000000 USDC units →6077681066841653 WETH units**; reverse: **100000000000000 WETH units →16358 USDC units**. Final allowances cleared, snapshot restored and owned Anvil stopped. No owner funds were used. This closes the funded disposable-fork gate; actual public-testnet wallet compatibility and L1/operator charged fees remain open.

The native test first failed with `listen EPERM` in the agent sandbox, before allocating Anvil. It is now explicitly opt-in (`DEX_ANVIL_INTEGRATION=1`) for environments allowed to bind localhost; a skipped integration is not a passing Anvil run. The agent's one `pnpm testnet:fork` attempt failed at `upstream-read` /`FORK_UNAVAILABLE`, before local mutations. The subsequent owner run above supplies actual funded EVM evidence.

Final local verification, 2026-10-02: focused 16 passed /one native integration skipped; `pnpm test` 712 Vitest +85 Node tests passed /one native integration skipped; `pnpm typecheck`, `pnpm lint` and `pnpm build` exited zero. ESLint retains its existing React-detection notice; no source lint warnings remain. No UI changes, so no repeated browser smoke was required. Fresh review confirmed no remaining Critical/Important findings after the clock fix. These results do not substitute for the host fork run.

Fresh review found one Important issue: Anvil retains the fork header's wall-clock offset, so ordinary mining can preserve enough lag to expire a 30-second quote during paced validation. Fixed by guarded next-block timestamp alignment and prequote read-only warmup, retaining every original reader check. [Pinned Foundry time implementation](https://raw.githubusercontent.com/foundry-rs/foundry/4072e48705af9d93e3c0f6e29e93b5e9a40caed8/crates/anvil/src/eth/backend/time.rs). Also reuse the study's already-pinned input/native balances for receipt context rather than reading them twice.

## Original host check — accepted

This historical command passed at block 47573721. Do not repeat old qualification probes; the next grouped slice adds `contextBound`/`trackingVerified` checks to this same command.

### Command

From `vezta-dex`, with your existing `apps/api/.env` containing `BASE_SEPOLIA_RPC_URL` and Anvil installed, run:

```bash
pnpm testnet:fork
```

No dev server, API key for Trading API, owner wallet or public test tokens are required. The command starts its own ephemeral localhost node; it does not connect to an existing Anvil session. Allow up to five minutes for the bounded run. Keep the provider URL/key private; send only the JSON output.

Expected stages: pinned fork → fixture funding → USDC reset → exact USDC approval → USDC swap → exact WETH approval → reverse swap → final summary → owned Anvil stopped. The final summary must say `status:"testnet-fork-lifecycle-local-only"`, `verified:true`, `snapshotReverted:true`, `executionEnabled:false`. Action rows must show `verified:true`; `actualTotalFeeQualified:false` is intentional because Anvil does not qualify public L1/operator charges.

On error, send the last JSON rows; do not manually approve, fund a wallet, or extend quote expiry. `TESTNET_*` codes retain failed reader gates. `FORK_START_TIMEOUT`/`FORK_ANVIL_UNAVAILABLE` concern owned-node startup; `FORK_CLEANUP_FAILED` means snapshot restoration was not confirmed, although CLI still stops its owned child. `FORK_RPC_BUDGET_LOW` rejects an explicitly configured 1–2 RPS rate, which cannot fit this unchanged validation pipeline inside 30 seconds; the normal 3 RPS default is retained. There is no automatic retry of a send or adapter fallback.

## Choices and remaining work

- Reuse runtime-guarded readers; no contract clone, compiler rebuild or extra source downloads.
- Seed a differing allowance so reset is exercised; trust only confirmed event plus pinned allowance reread. After exact approval is verified, proceed directly to a new quote/preparation instead of repeating a ready-only probe.
- Keep all production 30-second quote and 25-second reader bounds. Source fork identity may be at most 120 seconds old while starting the child; fresh executable quotes retain the stricter 30 seconds.
- Snapshot/revert and terminate the owned process on exit. Tests cover semantic failure cleanup; host run must confirm actual native/EVM behavior.
- The original funded fork gate is accepted. Final recheck/action contexts and receipt consumers are now implemented in the [next grouped slice](2026-10-02-testnet-recheck-receipt.md); only their updated fork check remains. Next come the Base Sepolia wallet controller/recovery, testnet v3 LP and desktop acceptance/release checks. Mobile and main Vezta integration stay deferred.
