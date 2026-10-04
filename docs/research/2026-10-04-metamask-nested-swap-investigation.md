# MetaMask nested swap receipt investigation

## Resolution — option A implemented

The owner selected A. The supported swap profile now authenticates exactly two
canonical single-execution layers and both owner signatures. The outer delegation
is one-use and exact; the inner delegation is self-to-self with exactly the
observed native/output/input balance guards. Nested LP, approval, extra layers,
batches, other owners/currencies and unknown enforcers are rejected.

Both new enforcers were independently rebuilt with solc
`0.8.23+commit.f704f362`, hash-checked metadata-listed sources and original metadata
compiler settings. Complete bytecode, including metadata, matches RPC code at
the original receipt block **47660523**; no bytes were masked and neither contract
has immutables. See [runtime proof](2026-10-04-metamask-balance-runtime-proof.json).
Sourcify's reconstructed standard input normalizes compiler defaults/remappings;
compilation therefore uses original metadata settings and verifies the resulting
metadata as well as runtime. A separate reviewer reproduced both runtimes offline.

The original context/hash was checked through the running receipt API and returned
HTTP 200, **confirmed**, **verified**, **MetaMask delegation**, with 902 confirmations
at that observation. Input is `1000000` USDC base units, output
`6352899849854487` WETH base units, above original minimum `6318049916069547`.
Normal receipt tracking bound this hash to its original context. No context was
reconstructed, no review/deadline was extended and no transaction was sent.

### Decisions retained

- Wallet balance floors/caps can be looser than the review. They are validated
  as signed guardrails, never substituted for the exact router calldata or
  receipt's exact-input/original-minimum checks.
- Runtime checks for the two new enforcers run only for this nested swap profile;
  the existing four runtime gates still apply to every supported wrapper.
- Receipt proof requires one usage counter plus both ordered redemption events:
  inner redeemer is the owner, outer redeemer is the relayer. Parent nonce/code,
  complete canonical block authorizations, effective gas price, token economics
  and recovery checks remain required.
- Observed outer L2 gas belongs to the relayer. Actual complete L1/operator fees
  remain unqualified, as before. Public testnet success is not mainnet acceptance.

### Owner next action

In `/demo/1`, preserve the original recovery record, click **Check original
transaction**, confirm **Verified executed output**, then **Acknowledge verified
result**. Do not resend this swap. Continue with the reverse WETH→USDC test and
the [desktop acceptance guide](2026-10-02-testnet-desktop-owner-guide.md).
If a future wallet produces another unsupported profile, preserve its hash for
investigation; this bounded update does not accept arbitrary delegation shapes.

### Verification

The new acceptance tests failed before implementation. The completed full run
passed **132 Vitest files, 992 tests** (one existing skip), plus **85 Node script
tests**. Typecheck, lint and an isolated webpack production build passed; lint
retains its existing React-version detection warning. Tests cover both swap
directions, signed guard/signature changes, extra layers/events, modified runtime,
nonce/block ambiguity, original minimum/exact input, reorg and hash binding.
Existing accepted fork runs were not repeated. Installed-wallet reverse swap and
LP lifecycle acceptance remain separate owner checks.

The sections below record the findings and decision **before** implementation.

## Owner report

The owner submitted a Base Sepolia swap and received `unverified`, diagnostic `transaction-mismatch`, for transaction `0x3b18344ea7c5d685615a2605d132bc005b16ce54f79d2c8dd3319ce730b2a465`, context `1fed3476d5e599a12202909e6edec4d670be2f11ef550055`.

## Read-only findings

- RPC receipt reports success at block 47660523. Its block hash matches the canonical RPC block.
- The transaction is a type-2 relayer call to the already pinned MetaMask DelegationManager, rather than a direct router transaction.
- The owner has the pinned EIP-7702 delegation indicator. Parent owner nonce matches the reviewed nonce; no new authorization is attached to this transaction.
- The outer signed, one-use exact delegation authorizes a second call to DelegationManager. Its signature validates for the reviewed owner.
- The inner call uses a self delegation with the same owner and three balance caveats. Its router call exactly matches the original reviewed calldata, including recipient, input, minimum and deadline.
- Token transfer logs report input **1 USDC**, output **0.006352899849854487 WETH**, above the original minimum **0.006318049916069547 WETH**.

These observations explain the failure but are not a replacement for the complete supported-profile receipt verifier. The original context remains unbound and unchanged. No funds were moved by this investigation.

## Root cause

`decodeMetaMaskExecution` currently accepts one constrained delegation whose execution directly matches the reviewed router/manager call. The observed outer execution instead calls DelegationManager again. The decoder rejects that difference before receipt economics are accepted. In addition, the observed receipt contains two RedeemedDelegation events; the existing event verifier expects one. This is unrelated to quote lifetime or RPC availability.

## Newly encountered contracts

The inner delegation uses `NativeBalanceChangeEnforcer` at `0xbD7B277507723490Cd50b12EaaFe87C616be6880` and `ERC20BalanceChangeEnforcer` at `0xcdF6aB796408598Cea671d79506d7D48E97a5437`. Both are listed in [official MetaMask deployments](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/documents/Deployments.md).

Their [native](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/enforcers/NativeBalanceChangeEnforcer.sol) and [ERC20](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/enforcers/ERC20BalanceChangeEnforcer.sol) source describes maximum decreases and minimum increases. The observed native limit is zero decrease; token caveats constrain USDC decrease and WETH increase. These two runtimes are not yet included in the demo's independently rebuilt profile evidence.

## Decision before changing verification

**A — Add the observed restricted two-layer swap profile (recommended).** Keep the original context/hash; acquire and independently rebuild the two new enforcer runtimes. Validate canonical encoding, both owner signatures, exactly two layers and one zero-value execution per layer, the outer one-use exact grant, supported balance caveats and original innermost calldata. Validate both delegation events with their actual redeemers plus the existing canonical block, nonce, gas, transfer and minimum-output checks. Add adversarial tests for changed calls, extra layers, unknown enforcers, mismatched owners, signatures and events. Recheck the same original hash read-only after the update. LP balance caveats require their own qualification rather than implicit acceptance.

**B — Continue future demo actions using a direct EOA wallet.** Use a wallet/account that does not auto-wrap sends, fund it with faucet tokens, and verify direct type-2 transactions. This does not fix or qualify the original wrapped swap; retain its recovery record. Disabling Smart Account in the same MetaMask account has not reliably prevented wrapping in the owner's earlier checks.

Do not replace the full verifier with Explorer Success, token transfers alone or unconditional decoding of nested calls. Await the owner's choice because A expands the verified execution profile and runtime trust boundary. No product behavior was changed in this investigation.
