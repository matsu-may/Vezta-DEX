# Standalone desktop testnet acceptance guide

Scope: Base Sepolia 84532, Uniswap v3 test USDC/WETH 0.3% pool. This guide covers owner-only acceptance after independently implemented local checks. Mock/fork results do not replace installed MetaMask/public-testnet receipts. Mainnet and integration into Vezta are outside this milestone.

## Start once

1. In `vezta-dex`, configure `BASE_SEPOLIA_RPC_URL` in `apps/api/.env`; keep it private. The read-only API does not need a Trading API key for this direct-v3 testnet adapter.
2. Stop your previous `pnpm dev` launcher with Ctrl-C, then run `pnpm dev:testnet`. Do not start both launchers together. Keep this terminal open.
3. Open `http://127.0.0.1:3020/demo/3` using the same hostname throughout. `localhost` and `127.0.0.1` have different origins and recovery storage.
4. Select your MetaMask account on **Base Sepolia**, chain **84532** (not Ethereum Sepolia 11155111). Direct accounts and the independently verified MetaMask v1.3 delegation profile are supported. Unknown contract wallets remain blocked. Resolve existing original transactions before requesting another action.
5. Fund that account with faucet **test USDC** and **test ETH on Base Sepolia**. WETH for LP can be obtained by the first USDC→WETH swap; test ETH pays gas and is a separate balance. Do not use mainnet assets or real keys in configuration.

## MetaMask EIP-7702 compatibility (2026-10-03)

**Updated 2026-10-04:** the observed two-level MetaMask **swap** is now supported
after independent runtime verification of both balance enforcers. It still binds
the innermost router call to the original review. The existing hash
`0x3b18344ea7c5d685615a2605d132bc005b16ce54f79d2c8dd3319ce730b2a465`
returned `confirmed` with verified output when rechecked through the receipt API.
For this pending browser record, keep the API running and click **Check original
transaction**, then **Acknowledge verified result** once verified. Do not submit
again. Continue with the reverse swap and LP checks below. Nested LP balance
delegations require separate qualification if encountered. See the
[resolution report](2026-10-04-metamask-nested-swap-investigation.md).

The demo supports the pinned MetaMask v1.3 single-action delegation profile on Base Sepolia: one exact reviewed call, signed one-use and exact-execution caveats, independently rebuilt manager/delegate/enforcer runtimes. Arbitrary Smart Accounts, batches, TRY calls, extra grants and unknown delegates remain unsupported. See the [design](../superpowers/specs/2026-10-03-metamask-eip7702-design.md).

EIP-1559 is the fee model; it does not guarantee that MetaMask will broadcast a direct type-2 transaction. MetaMask may authorize EIP-7702 and relay the reviewed inner call. The relayer has its own outer nonce and pays outer gas. The verified result displays that payer and observed L2 cost; actual charged L1/operator totals remain unqualified. No setting change rewrites an existing hash.

### Recover the existing approval first

1. Preserve your browser recovery storage and original hash. Keep using `http://127.0.0.1:3020`; do not clear storage, resend approval or change origins to bypass recovery.
2. Stop your old launcher with Ctrl-C and restart **`pnpm dev:testnet`** to load this update. Open `/demo/1` and reload. Newly issued swap contexts persist privately for 24 hours; contexts lost before this update are not reconstructed from browser input.
3. For an existing approval shown as `unverified` or with a lost context, click **Verify historical approval**. If archived, select its original hash in the preserved history. This is a read-only request and does not open MetaMask.
4. Review the wallet, Base Sepolia, original token/router and exact amount. A qualified historical result explicitly says the original review is unavailable. Click **Acknowledge historical approval** only after reviewing it. If its 30-second observation expires, verify again. This acknowledgment preserves the original record and does not revoke allowance or send a transaction.
5. Reconnect the same wallet and request a fresh quote. An existing exact 1-USDC allowance should lead to swap review rather than another approval. Other unresolved records still block that wallet.

The owner-provided hash `0x889a6ff469519954beb459f2ce04dfabb4bd957e6b5c00b7b05230fbe7fbe3b1` was independently verified read-only as an exact **1 USDC approval** for wallet `0x2c90304a4A0570221af2d997ccAc8f1Bc722D99a`. A different wallet or hash must pass its own checks. Historical recovery is limited to bounded approvals/resets; it does not qualify old swaps or LP operations without their original contexts.

### Quote and review timing (updated 2026-10-04)

New Base Sepolia wallet quotes expire **120 seconds after the quoted block timestamp**. The response carries `quoteTtlSeconds: 120`; the countdown, server store, preparation and router calldata all use that original deadline. Legacy quotes/contexts without the marker keep their original **30-second** deadline. Neither refresh nor recovery extends an existing transaction.

Simulation and fee studies still require a block less than **30 seconds old**. Submit opens a wallet prompt only while that review remains fresh; an expired review disables submit even if the quote countdown has time left. Request a fresh quote and review again when instructed. The on-chain swap deadline remains the quote's original deadline; minimum output and 0.5% slippage do not change.

For the earlier step **3C** (`TESTNET_QUOTE_UNAVAILABLE` after allowance-ready):

1. With no pending hash, reload `/demo/1` to load the update and click **Get wallet quote**. If your server has not loaded the changes, restart your launcher with `pnpm dev:testnet`. Preserve recovery storage.
2. Click **Review approval** if checking allowance. When it says **Allowance is ready. Review swap next.**, click **Review swap**; do not submit another approval.
3. Review **Simulated swap**, input, minimum received and complete fee budget. Click **Submit reviewed testnet transaction** while the simulation review is fresh, then confirm the same operation in MetaMask before the quote deadline.
4. Keep the returned hash, click **Check original transaction** until the original execution verifies, compare **Verified executed output** with that quote's minimum, and click **Acknowledge verified result**.
5. If there is already a hash, continue tracking that hash instead of requesting another submission. If still unavailable, report the safe Network response code and endpoint.

### Check a new reviewed swap

1. Request a fresh **1 USDC → WETH** quote on `/demo/1`; check chain 84532, input, minimum output, spender/target and fee budget. If the review expires, request it again.
2. Confirm only the reviewed operation in MetaMask. Keep the returned hash. The wallet may use its supported Smart Account profile; disabling it is no longer required for that profile.
3. Click **Check original transaction**, wait for two confirmations, and expect a verified execution. Wrapped results show **MetaMask delegation**, **Gas payer** and observed outer L2 cost. Check actual input and output against the reviewed input/minimum.
4. Click **Acknowledge verified result**, then obtain a fresh quote for the reverse direction if needed. Acknowledgment never broadcasts another transaction.
5. If still `unverified`, preserve the hash and report the safe diagnostic. Explorer Success alone does not establish matching reviewed economics; do not resend. A pending wrapper recovered by pasted hash remains unverified until canonical inclusion proves it belongs to the reviewed operation.

Public acceptance with your installed MetaMask is still required. Local mocks and fork fixtures do not substitute for that check.

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
