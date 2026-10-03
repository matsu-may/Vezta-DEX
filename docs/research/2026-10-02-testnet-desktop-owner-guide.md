# Standalone desktop testnet acceptance guide

Scope: Base Sepolia 84532, Uniswap v3 test USDC/WETH 0.3% pool. This guide covers owner-only acceptance after independently implemented local checks. Mock/fork results do not replace installed MetaMask/public-testnet receipts. Mainnet and integration into Vezta are outside this milestone.

## Start once

1. In `vezta-dex`, configure `BASE_SEPOLIA_RPC_URL` in `apps/api/.env`; keep it private. The read-only API does not need a Trading API key for this direct-v3 testnet adapter.
2. Stop your previous `pnpm dev` launcher with Ctrl-C, then run `pnpm dev:testnet`. Do not start both launchers together. Keep this terminal open.
3. Open `http://127.0.0.1:3020/demo/3` using the same hostname throughout. `localhost` and `127.0.0.1` have different origins and recovery storage.
4. Select a standard MetaMask account on **Base Sepolia**, chain **84532** (not Ethereum Sepolia 11155111). Smart/delegated account envelopes are not supported by this demo. The previously archived unsupported approval wallet remains blocked; use a different standard account.
5. Fund that account with faucet **test USDC** and **test ETH on Base Sepolia**. WETH for LP can be obtained by the first USDC→WETH swap; test ETH pays gas and is a separate balance. Do not use mainnet assets or real keys in configuration.

## Standard wallet and fee compatibility

New production studies use EIP-1559: the review shows maximum total fee per gas and maximum priority fee. These are ceilings, not the effective charged price. Historical legacy recovery retains its original gas-price model. Keep the prepared nonce, gas limit and fee caps unchanged in MetaMask.

Disable Smart account for the selected Base Sepolia account before sending. An empty preflight account code cannot prevent the wallet from later converting a request to a wrapped/relayed transaction. If this happens, keep the hash and inspect the receipt diagnostic; never keep creating/funding new wallets without checking the transaction type. Direct type-2 support does not qualify EIP-7702 type 0x4 receipts. Old hashes remain unchanged after settings are toggled. Archiving an unsupported approval preserves it and blocks its account; it neither verifies nor revokes on-chain authorization.

See [MetaMask standard-account settings](https://support.metamask.io/configure/accounts/switch-to-or-revert-from-a-smart-account/) and [compatibility design](../superpowers/specs/2026-10-03-testnet-eip1559-design.md). After public demo acceptance, review the full roadmap again before resuming product expansion and selective Uniswap source reuse.

### Check the EIP-1559 update

1. Preserve every unresolved original hash and its recovery record first. Do not delete storage or change hostname to bypass an account block. An old type-4 hash cannot become type-2; checking it again may correctly remain `unverified`.
2. When no transaction is pending, restart your launcher with `pnpm dev:testnet` to load the update. On `/demo/1`, connect a standard Base Sepolia account that is not blocked by unresolved recovery. Request a fresh quote and review the next required approval/swap. A rejected or expired review requires a fresh review.
3. Check **Fee model: EIP-1559**, **Maximum fee per gas**, **Maximum priority fee per gas**, network 84532, exact input, spender/target and total fee budget. On `/demo/2`, expand **Transaction and fee details** to see these fields. Keep the reviewed transaction fields unchanged in MetaMask.
4. Confirm only that reviewed action. Preserve its new hash, then click **Check original transaction** (or **Check original LP transaction**). Wait for two confirmations and a verified execution. Only then should **Acknowledge verified result** become available. After an approval, acknowledge it and request a fresh quote before reviewing the swap.
5. If it remains `unverified`, report the new hash and safe receipt `diagnostic`. If the explorer shows type `0x4`/EIP-7702 or a relayer, stop: the wallet still changed the request into an unsupported envelope. Do not submit again or keep funding alternative accounts; that compatibility requires a separate decision. Explorer Success alone does not qualify the original reviewed transaction.

Public acceptance is still required even though local type-2 tests pass. The application explicitly requests type-2; installed wallet behavior must be checked on the owner's machine.

## Suggested recording order

| Route | Owner check |
|---|---|
| `/demo/3` | Refresh Explore; chain, fee tier, token identities, source and block are clear. |
| `/demo/4` | Open pool detail; fixed address and fee 0.3% match Explore, links lead to Swap/Liquidity. |
| `/demo/1` | Connect, request a fresh 1 USDC→WETH quote, review exact approval if needed, submit it, check original receipt, acknowledge only a qualified result. Request a new quote and complete the swap. |
| `/demo/1` | Repeat with a small WETH→USDC amount, leaving enough WETH for LP. Compare input, minimum received, actual receipt output, account and chain. |
| `/demo/2` | Connect and read your positions; empty is valid before mint. Review token caps, actual planned deposits, minima, gas budget and manager before each action. |

## LP sequence

Use small test amounts that fit the displayed balances. Mint uses the demo's full tick range; increase preserves the NFT's original range. This is a demonstration, not a recommended investment range.

1. **Mint:** review and confirm each necessary reset/exact cap approval separately. After each confirmed approval, acknowledge it and request a fresh study. Approvals target the NFT manager, not the swap router. Then review and confirm mint; copy the resulting NFT ID and original transaction hash.
2. **Increase:** select that NFT ID, review another small deposit, complete any required approvals, then increase. Confirm the position's liquidity increases.
3. **Partial decrease:** choose 25% or 50%, review the minimums and submit. Liquidity should decrease, and amounts become owed by the position; this step does not transfer them to the wallet.
4. **Full decrease:** remove 100% of remaining liquidity. The position should have zero liquidity and owed amounts.
5. **Collect:** review and transfer owed amounts to the same owner. Actual payments may differ from the manager's nominal event by rounding dust; use the verified actual receipt result. Collection can include withdrawn principal and fees and is not itself profit.
6. **Close/burn:** only after liquidity and stored owed amounts are zero. The NFT should disappear from your ownership list.

After each confirmed manager action (mint/increase/decrease/collect/burn), the previous position scan becomes historical. Acknowledge the verified result, then explicitly click **Read LP positions** to obtain current NFT/liquidity/owed data before selecting another row action. No automatic RPC refresh is performed.

Each step is a separate explicit wallet confirmation. Wait for the original hash to qualify before starting another operation. Quotes/studies expire; expiry requires a fresh review and never automatic resubmission.

## Failure and recovery checks

- Reject one wallet prompt: it must show rejection, not success; request a fresh study to try again.
- Change account/network or input after review: the review must invalidate without sending.
- Reload after a submitted hash: no new wallet prompt; check that same original hash.
- If submission outcome is uncertain, preserve the record and recover the original hash from MetaMask. Do not send the action again, delete local storage or switch hostname to bypass it.
- Pending/reorg/unverified results keep recovery active. An API restart should preserve LP context; keep its ignored `.local-evidence` file intact. Public replacement transactions and unsupported wallet types require manual investigation.
- A pending swap blocks a new LP action, and a pending LP blocks a new swap; both original receipt checks stay available.

## Evidence to report

Send only sanitized route/action, network/chain, NFT ID, original transaction hash, receipt status, displayed actual amounts and any safe error code. Do not send API keys, RPC credentials, signatures, raw private wallet requests or recovery-file contents.

Acceptance remains pending until public MetaMask swaps in both directions and the complete LP lifecycle have qualified. Actual charged L1/operator fees, public wallet compatibility, remote CI and mobile polish must be recorded separately from local fee estimates/forks.

### Approval caps and residual authorization

LP approvals authorize each explicitly selected input cap. The SDK may deposit less to match the pool ratio, leaving a residual allowance. Review both the maximum authorized amount and planned deposit; do not interpret the cap as a promised spend. The manager is fixed and unlimited approval is rejected. After the demo, inspect/revoke residual manager allowances in your wallet's approval tooling if desired. Burning an NFT does not itself revoke ERC20 allowances. Swap approvals remain exactly the reviewed swap input.
