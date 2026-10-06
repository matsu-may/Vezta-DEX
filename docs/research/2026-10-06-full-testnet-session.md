# Full testnet implementation checkpoint

Worktree: `codex/testnet-product-completion`; base `0230f3c`. Owner checkout,
servers and recovery records were preserved. No merge, push, deployment,
public signature, mainnet funding or new application dependency.

## Completed independent work

- Fixed cold owned-Anvil custom-range mint preparation with a bounded read-only
  warm call. The six-RPS fixture budget applies only to explicit numeric-port
  `http://127.0.0.1`; public rate limits, simulation limits and the 600s watchdog
  were preserved.
- Full actual range lifecycle passed at Base block **47764060**, NFT **82680**,
  range **221220–222480**: exact approvals, mint, increase, partial/full decrease,
  collect, burn, residual allowance clear and original receipt/restart recovery.
  Five NFT range checks passed; snapshot reverted and owned Anvil stopped.
- Independently rebuilt and matched five Unichain Uniswap runtimes. See the
  [chain qualification report](2026-10-06-unichain-qualification.md).
- Added explicit immutable chain registry and chain-specific swap/LP domains,
  RPC source, quote/quote store, LP SDK planning, LP study/store/recheck and
  original approval receipt handling. Legacy Base entry points and serialized
  recovery remain Base-only; new-chain construction is explicit.
- Added wrong-chain/source/token/pool/spender/calldata, cross-store/restart,
  malformed source/compiler/runtime and original-receipt mismatch regressions.
  Estimation envelopes bind the selected chain and supported destination.

Mint deposited **1000000 USDC units / 4022620472542847 WETH wei**; increase
**100000 / 402262047252516**; final collect **1099998 / 4424882519795362**.
These are local fixture amounts, not owner earnings. Actual complete fees remain
unqualified, explicitly labeled; historical receipt components cannot establish
an absent operator fee or a reviewed wallet's debit.

## Decision required before completing chain 2

The Base-qualified MetaMask manager is absent on Unichain and delegate bytecode
differs. Keep Unichain delegated execution blocked. The owner needs to select:

1. **EOA first (recommended):** Base retains both supported wallet profiles;
   Unichain uses an EOA wallet/profile compatible with direct transactions.
   Complete and verify two-chain swap/LP/recovery before public acceptance.
2. **MetaMask smart account on both:** independently resolve and qualify
   Unichain's actual manager/delegate/enforcer stack, chain-specific signed
   domains, envelope and receipt reconciliation. This adds security work and
   cannot be replaced by reusing Base hashes or changing a chain ID.

No owner retesting is needed merely for this internal checkpoint. After the
choice and remaining implementation, consolidate public wallet tests into one
pass. Unichain is not yet exposed as an executable HTTP/browser product.

## Remaining work

Finish chain-qualified swap state/approval/prepare/action/recheck/receipt,
position discovery, API dispatch and store namespaces, network selection,
original-chain recovery and global unresolved-submission lock. Prove the new
adapter with an owned swap/LP fork and desktop wallet mocks. Then update the
single owner guide and perform faucet-funded public acceptance on both chains.
The standalone testnet task is **not complete** at this checkpoint.

## Verification and handoff

- `pnpm test`: 163 Vitest files passed; 1125 tests passed, one skipped.
  The additional Node suites passed all 85 tests. Exit code 0.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit code 0. Lint retains the
  existing workspace React autodetection warning, with no lint errors.
- One independent read-only review found no Critical or Important issues in
  this checkpoint and no identified Base regression. Review is not a substitute
  for the remaining new-chain execution and public wallet acceptance.
- No UI behavior changed in this checkpoint. Owner checkout and running API
  were preserved; changes remain on the isolated implementation branch.
- Continue after the wallet-profile decision. Do not repeat completed runtime
  rebuilds or the successful Base custom-range fork unless a relevant change
  invalidates that evidence.
