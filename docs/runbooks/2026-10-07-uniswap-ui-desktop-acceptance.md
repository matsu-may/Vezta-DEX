# Desktop acceptance — Uniswap-style frontend

## Start the right checkout

The UI changes have been integrated locally into the original `vezta-dex` checkout:

```bash
cd /Users/thongtran/Vezta/vezta-dex
pnpm dev:testnet
```

Use the original checkout's existing local server configuration. Credentials and recovery files are preserved; never copy values into reports or commits.

Ports are web `3020`, API `3021`. If occupied, use your existing session only if it runs this checkout. Preserve an API that is still tracking an unresolved swap; finish recovery before changing servers. The browser preview used for this session was separately owned on `3120` and has been stopped.

Open `http://127.0.0.1:3020/networks/base-sepolia/swap` at desktop width 1280–1920. All subsequent paths below start with `/networks/base-sepolia`; use `/networks/unichain-sepolia` for the other workspace. Unichain requires a standard EOA without active delegation.

## 1. Header and wallet

1. Hover Explore: Tokens / Auctions / Pools / Transactions appear. Move into a link without the menu closing.
2. Hover Pool: View positions / Create position / Launch auction appear.
3. Tab to a menu, press ArrowDown, select a link; Escape returns focus to the trigger. Clicking outside closes it.
4. Connect wallet at top right opens the MetaMask picker; opening the picker alone must not open MetaMask. Choose MetaMask to authorize connection.
5. Navigate using links from Swap to Positions and Create position. The same authorized signer is restored without another permission prompt. Reload starts with explicit connection again unless recovering an original transaction.

## 2. Explore and pool detail

1. `/explore/tokens`: USDC and WETH addresses must belong to the selected chain; search a name/address and an unmatched term.
2. `/explore/pools`: Base has four curated fee tiers; Unichain currently has one. Search fee/address. Listing alone must not be described as a fresh execution qualification.
3. Click a pool: verify network, pair, fee, address links, Swap sidebar action and LP availability. LP creation is limited to the qualified 0.3% pool.
4. Refresh pool sample explicitly. Data must include output, minimum, observed time and block; a provider failure must show unavailable, not a verified zero.
5. Auctions and Launch auction must explain unsupported functionality without a signing/submission form.
6. `/explore/transactions`: filter browser-local history by wallet and action. It is not a global feed.

## 3. Swap regression

1. Connect; get a quote in each direction with a small allowed amount. Verify token symbols, minimum, slippage and selected network.
2. Search USDC/WETH by name or address in the token modal. Open the token picker or reverse the pair after review. The old quote/action must disappear; fresh review is required.
3. Complete one small testnet swap with the familiar approval/reset → review → submit → original receipt → acknowledge flow. Minimum and exact authorization remain visible.
4. Closing a transaction review must not submit. Reopen it with Review prepared transaction; expired quotes disable submit. Acknowledge/reject must not reopen an empty review. If approval is already ready, proceed to swap review. Use a fresh quote when expired.
5. After receiving a hash, optionally navigate to Explore and return using the recovery link; reload must retain that original hash and never send again. Wallet/network selection stays locked while recovery is pending.

No need to repeat compiler rebuilds or old diagnostic/fork suites for this UI check. Preserve an unverified/uncertain record and report its safe diagnostic rather than resending.

## 4. Create and manage positions

1. `/positions/create`: select the supported pool. Inspect Full range and Custom range, lower/upper inputs and actual snapped bounds. Invalid bounds must prevent study. The diagram represents selected bounds only.
2. Review deposit caps, balances at study, planned/minimum deposits and fee budget. Planned amounts may be lower than authorization caps.
3. Complete a small mint if desired, acknowledging each separate reset/approval/mint result. Keep the NFT ID.
4. `/positions`: use connected wallet or enter another owner; explicitly Read LP positions. No positions owned is valid only after a successful empty scan.
5. View position carries the queried owner, which may differ from the signer. Read again for a fresh snapshot; detail shows only the requested NFT. Unscanned differs from missing after a completed scan.
6. Open Add liquidity, Remove liquidity, Collect tokens and Close position forms. Check their ownership/stale-data gates and explanations. Reuse the earlier tested lifecycle if confirming writes: decrease adds NFT owed; collect transfers tokens; close requires zero liquidity and owed.
7. After a verified mutation, scan must become Historical scan · refresh until another explicit read.

## Report

```text
Header / menus / wallet continuity: pass or issue
Explore / pool detail / searches: pass or issue
Swap presentation + original recovery: status and hash
Create full/custom range: pass or issue
Position detail / lifecycle forms: NFT ID and issue if any
Desktop layout: width and screenshot if clipping
Network switch / local activity: pass or issue
```

Send only safe error code, stage, public hash/NFT ID and screenshot. Do not send API keys, credentialed RPC URLs or recovery-file contents. Mobile polish and deployment are separate follow-ups.
