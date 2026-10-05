# Base Sepolia direct-pool routing

Continuation of phase 7 of the owner-approved product roadmap. The owner has
authorized independent, reversible decisions and will test the combined delta later.
Work only in the isolated product branch; preserve the running checkout and recovery.

## Design and decisions

- Compare the four curated USDC/WETH v3 fee tiers at one canonical block. Select
  greatest integer output among pools passing runtime, configuration and <=100 bps
  price impact checks. This is direct-pool comparison, not global or gas-adjusted routing.
- Default absent routing fields remain the original 3000-fee policy. The demo offers explicit opt-in
  comparison; an optional explicit fee selection supports deterministic review.
- Pin the winning pool/fee in the saved quote. Approval, recheck, calldata and recovery
  must use that quote, never reroute it. Bind routing preferences into quote IDs.
- Compile the accepted pool source once; verify the original deployment first, then
  map every immutable for each curated address/fee/spacing and compare every runtime
  byte. Fresh RPC reads still verify each pool at request time. No byte masking.
- LP remains the accepted 3000-fee pool. A comparison failure never supplies an
  unverified pool; partial coverage is disclosed. No public transaction is automated.

## Tasks

### Task 1: Pool provenance
RED: synthetic compiler-boundary tests for alternate immutables, wrong address,
fee, code and original template. GREEN: reusable strict verifier and bounded
read-only evidence CLI. Run independent rebuild against public on-chain bytes;
record compiler/input/output/block hashes and commit only public runtime fixtures.

### Task 2: Route binding and comparison
RED: legacy compatibility, curated fee/pool pairing, route-bound quote IDs,
greatest-output selection, impact rejection, partial provider failures, wrong
runtime/configuration and no rerouting during prepare/recovery.
GREEN: core schemas/helpers, quote comparison, approval/preparation dependency
selection, wallet intent binding. Keep timeout, canonical block and exact calldata.

### Task 3: Desktop UI and handoff
RED: routing settings invalidate quote; selected fee/pool visible; old recovery
still parses. GREEN: compact dropdown/details and selected-pool navigation.
Run focused tests, one full suite/typecheck/lint/build, production browser mocks,
fresh whole-change review and a bounded local-only fork if network evidence permits.
Update progress and owner delta guide; commit locally without merging or deploying.

## Review focus

Non-default fee in calldata vs stored intent; partial comparison called globally best;
RPC timeout publishing late quotes; fake pins derived only from RPC; mutation of legacy
contexts; alternate pool code passed where original pool is expected; hidden changes to
LP; resubmission after reload; fee estimates misrepresented as actual complete fees.

## Phase 8

Read-only second-chain feasibility can proceed independently. Activation awaits the
owner's chain choice and separate deployment/liquidity/wallet evidence.
