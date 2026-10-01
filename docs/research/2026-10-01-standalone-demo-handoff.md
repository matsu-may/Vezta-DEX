# Standalone DEX demo handoff — 2026-10-01

## Run without a funded wallet

From `vezta-dex/`, run `pnpm install` once, then `pnpm --filter @vezta-dex/web dev`. Open `http://127.0.0.1:3020/demo`. This route needs no API, RPC, wallet extension, USDC or WETH. The default `pnpm dev` also starts the API and therefore still needs its usual configuration; use the web-only command for this demo.

## Desktop walkthrough

1. Confirm the banner says **No wallet or real transaction** and shows virtual 1,000 USDC and 1 WETH.
2. Enter `10` USDC, click **Preview simulated swap**, inspect output, minimum and illustrative 0.05% pool fee, then click **Simulate swap**. The USDC balance becomes 990 and the receipt says **simulated swap**. Changing the amount or direction before simulating removes the old preview.
3. Click **Create demo position**, **Increase demo liquidity**, **Credit example fee**, then **Remove half**. Principal is owed but is still outside the virtual wallet.
4. Click **Collect owed tokens**. The receipt separates 62 USDC principal and 0.25 USDC example fee. A second collect is disabled until another decrease. Click **Remove all**, **Collect owed tokens**, then **Close demo position**.
5. Click **Reset demo** or reload. The initial virtual balances return, with no position or pending action. Inspect `/explore`, `/pools`, `/positions` and `/swap` separately for read-only Polygon data. `/rehearsal` remains a separate opt-in real-wallet development route.

Every demo amount and local receipt is simulated. The constant-product swap is not a Uniswap v3 quote. The LP fixture is separate from that synthetic pool; its one-time example fee is credited by a button, not earned from trading. The walkthrough makes no transaction, receives no real NFT and makes no APR claim.

## Evidence and limits

On 2026-10-01, `pnpm test` passed 480 Vitest and 82 Node script tests; `pnpm typecheck`, `pnpm lint` and `pnpm build` passed. Component tests cover reset, quote invalidation, insufficient balance, the LP lifecycle, and no `fetch` call during a simulated swap. The existing `node scripts/smoke-lp-fork-lifecycle.mjs` was previously reported passing by the owner on an Anvil fork; it is separate contract-level evidence, not a browser transaction from `/demo`.

Browser acceptance from this agent environment is pending: `pnpm --filter @vezta-dex/web dev` failed to bind `127.0.0.1:3020` with `listen EPERM`. On the owner's machine, check the desktop steps above and DevTools Network for no `/api/*` request from the demo actions; there should be no wallet prompt. Loading the page may still request Next.js static assets. Mobile visual acceptance is deferred under the owner's existing decision.

## Testnet and real-trading boundary

A later testnet proof should use a separately configured chain with verified tokens, funded test wallet, usable pool liquidity, RPC, correct Uniswap deployments and receipt checks. Uniswap's [Trading API supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains) include Base Sepolia, Ethereum Sepolia and Unichain Sepolia, but not Polygon Amoy. Testnet addresses cannot stand in for Polygon mainnet deployment evidence. No testnet write, mainnet wallet swap, funded LP position or production write release is claimed here. No code was integrated into the main Vezta apps.
