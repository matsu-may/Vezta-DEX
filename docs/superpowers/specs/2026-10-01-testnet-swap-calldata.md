# Base Sepolia swap calldata foundation

## Intent and scope

Continue the owner's authorized standalone testnet demo, using the confirmed 0.3% v3 USDC/WETH pool and manual bidirectional preview evidence. This slice implements pure unsigned transaction construction and inspection; no API endpoint, wallet prompt, signer or broadcast is added. Native ETH is reserved for gas; swaps use canonical ERC20 USDC/WETH only. The candidate remains gated for actual execution.

## Adapter choice

Use Base Sepolia SwapRouter02 `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4` for this narrow direct-v3 demo. Universal Router is Uniswap's preferred general entrypoint, but the direct single-pool adapter can express this scope with one `exactInputSingle` call and exact ERC20 allowance to the router. This adapter carries no Trading API payload or Permit2 signature. Its router address and allowance must remain separate from the Polygon Universal Router flow. Deployment bytecode/configuration and a successful simulation remain prerequisites for wallet execution.

Pool: `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad`, chain 84532, fee 3000. Token identities and decimals come from the existing Base Sepolia registry. Supported input samples stay 0.1/1/5 USDC and 0.00001/0.0001/0.001 WETH until further measurements justify another range.

## Transaction contract

A strict intent binds chain, wallet, canonical token direction, raw input amount and 50-bps slippage. Quote evidence binds that same intent, source, selected pool, fee, positive amountOut/minimum, block number/hash and block time. The minimum is exactly `floor(amountOut * 9950 / 10000)` and must remain positive. Quote freshness is 30 seconds, with at most 10 seconds future tolerance. Use bigint raw amounts throughout.

`buildTestnetSwapTransaction(quote, nowMs)` sets `from` to the reviewed wallet, `to` to the pinned router and `value` to zero. Wrap exactly one `exactInputSingle` inside `multicall(uint256 deadline,bytes[])`, because the SwapRouter02 single-input tuple has no deadline field. Set deadline to the quote's block time +30 seconds, preserving its original lifetime. The recipient is the wallet; fee is 3000; sqrt-price limit is zero. The later quote adapter must enforce full-input-consumption and live depth before producing this evidence.

`inspectTestnetSwapTransaction(transaction,quote,nowMs)` checks the envelope and requires canonical byte-for-byte calldata for that quote, rejecting alternate recipients/spenders, extra calls, wrong deadlines, missing deadline wrappers, partial-fill limits and trailing data. It proves intent binding, not that a quote is authentic or a transaction will succeed.

`planTestnetTokenApproval(intent,currentAllowance)` returns ready only when allowance equals the exact input amount. Zero allowance produces a token-targeted exact `approve(router,amountIn)`. Any nonzero differing allowance produces only `approve(router,0)`; a new read after its receipt must precede the exact approval. Never return a batch of reset and approval transactions based on one stale observation.

## Threat model and remaining gates

| Scenario | Asset / trust assumption | Impact | Mitigation / verification | Owner |
|---|---|---|---|---|
| Polygon router or Permit2 reused | Test tokens; chain identity | Wrong approval/signature | Separate registry and strict chain/spender tests | Core adapter |
| ERC20 allowance wider than reviewed input | Test tokens; exact-amount policy | Unexpected spending authority | Exact equality or reset-to-zero; re-read before next approval | Approval controller |
| Single-input call has no deadline | Quote freshness | Stale execution | Deadline multicall, original 30-second lifetime; boundary tests | Core adapter |
| Alternate recipient/extra call/trailing bytes | Wallet intent | Diverted output or additional action | Re-encode and compare canonical calldata; mutation tests | Core inspector |
| Forged quote or changed pool state | RPC authenticity and full consumption | Bad swap/partial fill | Later pinned live reads, depth/identity checks, simulation and receipt deltas; builder does not authenticate input | API and receipt adapters |

Remaining: verify live router/configuration and pool, fresh wallet-bound RPC quote, EOA/balances/gas/nonce/allowance reads, quote storage, simulations and exact calldata rechecks; then explicit wallet submission, original-hash recovery and economic receipt reconciliation. Faucet test ETH/USDC and NFT LP lifecycle follow separately. This slice grants no write permission.

Sources: [official Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [IV3SwapRouter](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol), [deadline multicall](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IMulticallExtended.sol).
