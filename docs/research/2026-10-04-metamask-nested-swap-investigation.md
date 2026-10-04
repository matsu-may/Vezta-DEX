# MetaMask nested swap receipt investigation

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
