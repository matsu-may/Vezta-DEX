# Initial swap signer boundary — owner decision pending

## Context and verified progress

The owner verified read-only Permit2 signing plans for both curated Polygon directions at blocks 94600398 and 94600401. The backend accepted exact amount, canonical domain/types, Universal Router spender, nonce and approved time windows. No signature or receipt was supplied. The standalone UI currently reads an injected EIP-1193 provider; its installed-wallet and funded-execution gates remain open.

The next wallet-flow task must verify a signature from the saved quote, consume that quote once, obtain `/swap` calldata, validate actual spend/output/recipient/deadline, and simulate. Specifying which account types can execute this flow is necessary before building the signature and wallet submission adapters.

## Why account type matters

The [canonical Permit2 signature verifier](https://github.com/Uniswap/permit2/blob/main/src/libraries/SignatureVerification.sol) uses ECDSA recovery for accounts with no deployed code and ERC-1271 `isValidSignature` for accounts with code. It accepts 65-byte or compact 64-byte signatures on the EOA branch. Recovering an EOA address is therefore insufficient to establish validity for a contract account.

The [Uniswap quote API](https://developers.uniswap.org/docs/api-reference/aggregator_quote) recommends `generatePermitAsTransaction: true` for a 7702-delegated wallet. It documents the generated on-chain permission as indefinite, unlike the normal 30-day message path. That documented path cannot be silently substituted under the owner's selected 30-day Permit2 cap. Any such transaction must be decoded and independently checked against exact amount and expiry policy; if it violates them, reject it and investigate a compatible adapter.

The [viem public verification action](https://viem.sh/docs/actions/public/verifyTypedData) supports additional smart-account verification mechanisms, including counterfactual wallets. A positive helper result alone does not establish that canonical Permit2 accepts the same signature bytes, or that the injected provider can submit the required smart-account transaction. Verification, API calldata generation and wallet submission need compatible paths.

## Options to review

| | A — EOA first (recommended) | B — smart wallets in the first slice |
|---|---|---|
| Initial accounts | Addresses with no deployed code or EIP-7702 delegation at the checked Polygon state | EOA plus explicitly tested smart-account categories |
| Permit path | Existing unchanged PermitSingle message; exact amount, max 30-day allowance / 30-minute signature deadline | Evaluate ERC-1271 and delegated accounts separately; preserve the approved amount and expiry caps |
| Signature check | Verify canonical 64/65-byte ECDSA signature against the saved message and account | Contract verification with pinned chain state; reject wrappers canonical Permit2 cannot consume |
| Wallet submission | Existing injected-provider EOA transaction flow | Separate adapters for provider calls / smart-account execution as required |
| Work to prove | Signature identity/replay, account-code changes, calldata policy, simulation and EOA receipts | All A checks plus account implementation, delegation changes, signature encoding, API compatibility and smart-account receipts |
| Product limitation | Smart/delegated accounts remain readable but cannot open a swap signing/write prompt | More wallet coverage after additional compatibility gates pass; unknown account variants remain unsupported |

**Recommendation:** choose A for the small standalone DEX. Detect account type using chain state, not the wallet brand; MetaMask or another wallet can expose different account modes. Show the unsupported account state before asking for a signature. Extend support through explicit adapters later when integrating with the main Vezta wallet.

No signer restriction or signature/submission code is introduced by this document. The owner asked that important choices be analyzed and decided by them. Record their selection here before proceeding with account-specific implementation.

## Requirements common to either choice

- Preserve Polygon 137, native USDC/WETH, CLASSIC, Universal Router 2.1.2 and V4_NO_HOOKS.
- The browser supplies only the intent, opaque quote ID and resulting signature; it cannot supply a replacement quote or permit message.
- Verify the original saved PermitSingle message, recheck intent/TTL and nonce after asynchronous work, and prevent concurrent or repeated consumption.
- Recheck exact ERC20 approval and balances before execution. Preparation is not approval, simulation is not a receipt.
- Request swap simulation, verify returned chain/from/router/value and decode all supported Universal Router commands and nested V4 actions. Reject unknown commands, hooks, side effects, recipients, unsafe amounts or deadlines. Never forward calldata merely because its target is the router.
- The documented [swap API](https://developers.uniswap.org/docs/api-reference/create_swap_transaction) accepts quote, signature, permitData, deadline and simulation request. Use the saved quote's exact permit inputs, the shared key limiter, bounded responses and generic safe errors. No automatic signed-request retries.
- Keep browser write controls gated until installed-wallet, exact approval receipt, signed preparation, simulation and small-swap receipt evidence pass.
