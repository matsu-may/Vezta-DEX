# Testnet LP wallet and assembled desktop demo

## Intent and authorization

Finish the independently implementable Base Sepolia desktop demo. The owner authorized routine choices and continuous implementation; public wallet signatures, faucet funding and final acceptance remain with the owner. No main Vezta integration, public deployment, mainnet, custom AMM or mobile polish.

## Scope

Use the existing pinned Uniswap v3 USDC/WETH 0.3% pool and verified manager. Reuse the SDK planner and historical runtime manifest. Expose mint (full range), increase (existing range), decrease (25/50/100%), collect, burn (only empty NFT), exact ERC20 approvals and necessary resets. Each action is separately simulated, reviewed, submitted and observed. No server signing or automated broadcasts.

A shared origin Web Lock coordinates swap and LP. Both controllers block new submissions while either recovery slot is nonempty or corrupt. Wallet chain/accounts/EOA are checked explicitly; changing inputs invalidates studies. Reload never requests a wallet prompt. Persist a submission marker before prompting and preserve uncertain outcomes, original hash and context. Clear only a freshly verified confirmed/reverted observation after explicit acknowledgment. Existing archived unsupported approvals still block that wallet.

## API contract

Core owns strict wire schemas in `testnet-lp-wallet.ts`, exported from core. Intent is a discriminated union with `chainId:84532`, `wallet`, `kind` (`mint|increase|decrease|collect|burn`). Mint/increase use string `amount0Cap` (USDC, <=5000000), `amount1Cap` (WETH, <=50000000000000000); mint uses fixed full range. Non-mint requires `tokenId`; decrease adds `percentage:25|50|100`.

Fixed POST endpoints: `/api/v1/testnet/base-sepolia/lp/{study,recheck,receipt}`. Web equivalents `/api/testnet-lp/{study,recheck,receipt}`. Requests respectively `{intent}`, `{contextId}`, `{contextId,hash}`. No caller-authored calldata, expected transactions, RPC URLs or fees.

Public LP approvals authorize the exact user-selected input caps, while SDK deposit desired amounts must stay below those caps. This prevents changing pool prices from repeatedly invalidating approvals between the two tokens. Display authorized caps, planned deposit and residual allowance distinctly. Internal historical fork desired-amount policy remains valid in its fixed fixture.

Study includes `contextId` (48 hex or null when blocked), `intent`, `status:blocked|prepared`, `reason:string|null`, `actionKind:reset|approve|mint|increase|decrease|collect|burn`, `approvalToken:USDC|WETH|null`, `plan` economic details, `transaction` unsigned envelope or null, `gas` qualified complete fee budget or null, `balances:{USDC,WETH,ETH}`, `allowances:{USDC,WETH}`, `blockNumber`, `blockHash`, `observedAt`, `expiresAt`, `source:base-sepolia-rpc`, `runtimeVerified:true`, `executionEnabled:boolean`.

Prepared transactions contain chain/from/to/data/value=0/nonce/gas/gasPrice. Core independently decodes the manager or ERC20 call, binds every field to intent and plan and restricts approval to exact user-selected token input cap or zero. The server requalifies canonical runtime/configuration/state, owner, EOA, nonce and funding. Deadline/review lifetime is at most 120 seconds for LP; swap remains 30 seconds. At recheck preserve the originally reviewed calldata, nonce and fee ceilings; simulate it against fresh pinned state. State drift or larger fee needs a new review. API context survives development restart via bounded strict mode-600 atomic files under ignored `.local-evidence/`; single process only, 24h/128 contexts, immutable original hash binding.

Receipt includes context/hash/action binding, fresh observed time/block, `status:unknown|pending|confirming|confirmed|reverted|unverified|reorged`, confirmations, diagnostic safe enum, `verified`, `tokenId` nullable, economic `amount0`,`amount1`, and `actualTotalFeeQualified:false`. Qualification requires original legacy envelope match, canonical receipt, two confirmations and operation-specific manager/pool/token events plus pinned NFT state. Collect uses actual pool payments/ERC20 transfers; manager nominal amounts may exceed payments by rounding dust. Unknown/reorg/unverified never unlock resubmission. Current balances are not treated as historical transfer evidence.

## Desktop routes

`/demo/1` swap; `/demo/2` LP wallet and positions; `/demo/3` curated testnet Explore; `/demo/4` pool detail. Match existing launchpad black/lime typography/layout. All carry Base Sepolia/testnet labels and links across the flow. Discovery is explicit, bounded and read-only; no invented TVL, APR or price promise. Keep technical diagnostics separate. Normal development stays read-only; wallet submission requires existing loopback `dev:testnet` opt-in gates at API and web.

## Verification and completion

Focused tests must cover wrong chain/owner/calldata/minimum/deadline, exact/reset approvals, nonce drift, incomplete fee model, expiry, response binding, storage failures, reload/unknown/reorg, cross-flow pending and unauthorized prompt prevention. Mock browser lifecycle covers all LP operations and desktop navigation. A disposable fork exercises the new study/recheck/receipt APIs end-to-end with local fixtures only; owner funds unused, snapshot reverted, owned Anvil stopped. Run full tests/typecheck/lint/build once after integration and review. Public MetaMask swap/LP acceptance is explicitly pending even when local/mock/fork gates pass.
