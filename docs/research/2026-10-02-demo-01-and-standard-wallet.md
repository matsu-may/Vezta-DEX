# Demo 01 and standard-wallet acceptance

## Scope and decisions

Owner chose direction A: standard-account-only Base Sepolia demo, with a separate route for recording. `/demo/1` is the desktop presentation route; `/testnet` remains the technical workspace; `/demo` remains the original local simulation. Both live testnet routes share the same controller, recovery storage, origin lock, API validation and localhost execution gates. No main Vezta integration, mainnet execution, new AMM contract, dependency or runtime pin changes.

Launchpad reference: black canvas, #111 cards, #D4FF2B primary action, near-square corners and monospace transaction data. `/demo/1` prioritizes input/estimated/minimum amounts, explicit connect/review/submit and original receipt tracking. Quote provenance is expandable; transaction target, spender, amount and complete fee budget stay visible. Future visual variants can use `/demo/2` without duplicating transaction logic. Mobile remains deferred.

## Public approval evidence and limitation

Read `eth_getTransactionByHash` and `eth_getTransactionReceipt` from public Base Sepolia RPC for `0xb53df0b47e44940dfdbf56a612378d55290be1964533ef7952a2cb406e4f012b`. Receipt status success; USDC Approval event owner `0xf66226221cE61d45765427B0D07ED9f3693bD81A`, spender router `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`, amount 1000000. Outer type 0x4, relayer sender, wrapped target/calldata and EIP-7702 delegation to MetaMask implementation `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`.

The demo's direct legacy envelope validator intentionally cannot claim this wrapped transaction is verified. Event success does not qualify the envelope or the owner's total charged fee budget. No automatic verified acknowledgment was added; no receipt-validation requirement was weakened. See [MetaMask smart account documentation](https://support.metamask.io/it/configure/accounts/what-is-a-smart-account/).

## Recovery policy

Only a hashed approval/reset with a fresh `unverified` observation, or an unavailable tracking context (backend410 or elapsed24h local tracking window), can be explicitly archived for manual review. A lost context is quarantined without asserting transaction success. A new checkbox acknowledgment is required for each hash. Swaps and missing hashes cannot be archived. Pending/uncertain approvals without a proven context-unavailable condition cannot be archived. Full validated original records are saved separately before active recovery is removed. Archive write/readback failure preserves active recovery. Corrupt history blocks actions; max16 records/128KiB. Origin Web Lock protects mutation and other tabs re-read history before any action.

Archiving means unresolved, not successful. The archived wallet remains blocked at connection, quote, review and submit. A different standard account is required. History and explorer links remain visible on both routes; do not clear site storage. All account checks require empty `eth_getCode` and matching chain/account. A wallet could still transform a request after the final check; the direct receipt validator will continue to reject unsupported envelopes. In MetaMask, decline smart-account conversion or relayed/gas-token execution for this demo.

## Owner steps

1. Keep the original hash. In `/testnet`, click **Check original transaction** to obtain a fresh `unverified` observation. Check the acknowledgment, then **Archive approval for manual review**. If API context is gone/expired, the same quarantine action is available only for hashed approvals/reset. Keep the record and use a different standard account. If no hash is stored or the action is a swap, stop and report the code; do not delete recovery manually.
2. Create/select a different standard MetaMask account on Base Sepolia84532. Leave smart account disabled on that network; decline any upgrade prompt. Use faucet test USDC and test ETH for that new address. The old approval does not apply to the new account.
3. Keep `pnpm dev:testnet` running. Open `http://127.0.0.1:3020/demo/1` for recording. Both routes share recovery; switching route never resets it.
4. Connect, get fresh1USDC quote, review approval, inspect spender/target/amount/fee and confirm the exact transaction in MetaMask. Do not change nonce/gas or choose an unsupported smart-account transaction. Check original receipt until confirmed, acknowledge, then get a new quote and review swap.
5. Submit USDC→WETH, verify executed output and original receipt. Acknowledge. Repeat WETH→USDC using a capped amount you own; approve exact WETH if required.
6. Send public hashes and any unexpected UI/network messages. Neither swap direction nor actual public charged fee qualification has been accepted yet.

## Verification and remaining work

Focused RED→GREEN covers archival eligibility, preservation on storage failure/reload, blocking archived/delegated wallets, reset of checkbox acknowledgment for a new hash and stale switch notice. No new public signatures or broadcasts performed by the agent. Desktop mocked browser and full quality gates recorded in the session checkpoint.

Deferred: mobile layout polish; public standard-wallet acceptance; actual charged L1/operator fee qualification; Base Sepolia LP lifecycle and broader product assembly from the full roadmap. Demo01 pool overview is one curated real pool; not a complete pool search/aggregation interface.

## Follow-up diagnostics and video checklist

Receipt failures now preserve bounded busy/timeout/stale/invalid/context codes. `unverified` reports an enum-only diagnostic: unsupported type, reviewed transaction mismatch, receipt mismatch, missing transaction data or token-event mismatch. Diagnostic messages never expose provider error bodies. These labels do not relax envelope/event validation.

For a short desktop recording on `/demo/1`:

1. Start `pnpm dev:testnet` once; keep the API running. Open127.0.0.1:3020, select a funded standard account and Base Sepolia84532. Do not switch accounts/chain during a reviewed action.
2. Show the pool/network label and input1USDC. Get a fresh quote and show estimate/minimum0.5%slippage. Testnet prices have no monetary value.
3. Review exact approval if required, inspect target/spender/budget and confirm in MetaMask. Decline smart-account conversion, relayed gas-token payment or a changed transaction envelope. Keep nonce/gas fields unchanged.
4. Check original receipt, acknowledge only after verified confirmation. Get another fresh quote, review and explicitly submit the swap. Show verified executed output and explorer hash.
5. Repeat the reverse direction using WETH actually received. Show its exact approval if required, then the original verified swap receipt.
6. If expiry, pending, RPCtimeout, unverified or lost context occurs, show the actual status and follow its instructions; do not portray a mock receipt or an archived approval as a verified public swap. Do not clear recovery for a cleaner recording.

Public signatures remain owner-operated. Standard-account two-way swap acceptance, funded latency and actual charged L1/operator fee qualification remain open. No new public transactions were sent during the fixes.
