# Unichain EOA adapter — implementation and evidence

Started 2026-10-06; local checkpoint finalized 2026-10-07.
Owner accepted **A: Unichain Sepolia EOA first**, retaining Base Sepolia's
qualified EOA/MetaMask delegation profile. This supersedes the pending wallet
choice in the earlier [checkpoint](2026-10-06-full-testnet-session.md).

## Implemented

| Area | New behavior |
|---|---|
| Chain adapter | Explicit1301/84532 domain for wallet state, exact token approvals, swap preparation/recheck, contexts, receipts and LP positions/actions |
| Server | Independent Unichain RPC/services and persisted context directories; fixed `/api/v1/testnet/unichain-sepolia/*` namespace |
| Browser boundary | Independent selected-chain parsers/proxies/clients; mismatched chain, intent, target or receipt fail closed |
| Desktop workspace | `/networks/{base-sepolia,unichain-sepolia}/{swap,positions,explore,pools,pool}`, common Vezta styling and top-right MetaMask/network controls |
| Recovery | Chain-specific active records, shared origin write lock across both chains and both flows, reload without wallet prompt/resend, links to original-chain recovery |
| Explore | Explicit read-only representative quote, filter, pool identity/detail, sample freshness and original source/block; legacy Base four-pool view remains linked |
| LP | Position ownership/fees; full/custom range; reset/exact approve, mint, increase, partial/full decrease, collect and burn with original receipt reconciliation |

Unichain rejects delegated/contract accounts before signing and at server
qualification/receipt boundaries. Configuration alone never enables execution:
RPC, runtime, canonical block, balance/allowance, nonce, fee budget and simulation
checks still apply to every reviewed action. Unichain hosted admission is not
enabled; this checkpoint supports local public-testnet acceptance.

## Fork evidence — no owner funds or public broadcasts

| Evidence | Result |
|---|---|
| Unichain swap, block64447049 | Reset/exact approval;1USDC→116973791183800 WETH base units;100000000000000 WETH units→849791 USDC units; both original receipts/context tracking verified |
| Unichain LP, block64447265 | NFT418172, custom range185160..186420; mint/increase/partial+full decrease/collect/burn, retained range, balances/events, restart recovery and cleared allowances verified |
| Cleanup | Each successful lifecycle reverted its snapshot; both owned Anvil processes stopped |

The first complete swap run stopped at LP's fresh-block helper because its chain
argument still defaulted to Base. After correcting that argument, **only LP** was
rerun using `--lp-only`; the already-passing swaps were reused. No combined-run
success was inferred from a failed overall command. A prior RPC read failure was
reported without relaxing public timeouts.

The independently rebuilt five Unichain runtimes and completed Base custom-range
fork from `eaa5ca4` were reused. Neither compiler rebuilds nor the Base fork were
repeated. Fork fixtures use local funds; they do not prove public-wallet funding.

## Desktop/browser evidence

Disposable browser, mocked provider and API only:

- No wallet request on page load; explicit Unichain send uses chain0x515.
- Unresolved original transaction disables network selection.
- Reload preserves original hash without another prompt; checking receipts does
  not resend; verified output/acknowledgment completes the mocked swap.
- LP exact approval shows Unichain manager, verifies original receipt and acknowledges.
- Explore binds the representative quote, filters pools and retains chain identity
  on detail. Desktop screenshots inspected at1440×1000.

Reusable mock: `scripts/smoke-unichain-browser.js`. Run it only in a disposable
profile against the isolated preview; it is not a live acceptance script.

## Verification and review

- Full `pnpm test`:172 Vitest files,1137 passed/1 skipped;85 Node script tests passed.
- After the last selected-chain error wording fix: focused18 tests passed, including
  Base header/swap component regressions and Unichain LP error-label regression.
- Strict workspace typecheck and ESLint passed. Existing React autodetection warning
  remains; it does not suppress a lint error.
- Production build includes chain-selected product and API routes; final command
  result is recorded in the implementation ledger.
- One independent review of the new diff against `eaa5ca4`: no Critical/Important
  findings. No repeated review of unchanged compiler/Base-fork evidence.

One initial full run exposed outdated source mock exports and router coupling in
isolated header tests. The mock was updated to the explicit chain-source interface
and selector composition was moved to the workspace header. A focused regression
run passed, followed by one repaired full run. No full suite per feature/probe.

## Decisions and limits

1. **EOA only on Unichain:** avoids borrowing Base delegation proofs. Supporting a
   new Unichain smart-account implementation requires its own qualification.
2. **Shared panels, independent records:** preserve Base defaults/legacy URLs while
   reducing duplicated UI; malformed active records on either chain block new writes.
3. **Two canonical L2 confirmations per explicit chain policy:** this is inclusion
   observation, **not Ethereum finality**. [Base finality stages](https://docs.base.org/specifications/transactions/transaction-finality)
   distinguish L2 inclusion and L1 finality.
4. **One curated Unichain execution pool:** quote1USDC sample does not establish
   global best routing or USD TVL/APR. Base's previous four-pool catalog remains available.
5. **Fee budget versus paid fees:** independent fee-oracle/configuration checks and
   bounded budget qualify preparation. Actual charged L1/operator totals remain
   unknown; `actualTotalFeeQualified:false` is retained.

No main Vezta integration, mainnet activation, mobile polish, hosted backend,
merge/push or deployment in this checkpoint. Original owner checkout and servers
were preserved; only the isolated preview/browser were stopped.

## Remaining acceptance

The standalone task is **not yet fully accepted**: public Unichain wallet
swap/LP and recovery must be verified by the owner using faucet funds. See the
[one-pass owner guide](2026-10-06-two-testnet-owner-guide.md). Base's prior public
acceptance is reused; repeat only affected smoke checks or a concrete regression.
Missing actual charged fee totals and unqualified smart-account profiles remain
explicit limitations, not silent successes.
