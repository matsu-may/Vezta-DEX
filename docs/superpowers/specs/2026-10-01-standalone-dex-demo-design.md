# Standalone DEX Demo Design

## Intent and scope

Provide a repeatable browser demonstration of swap and liquidity-provider workflows without real assets, a wallet extension, RPC, or API keys. Keep the existing Polygon pool pages, live read-only quote preview, and opt-in real-wallet rehearsal separate. The demo does not qualify Polygon mainnet writes or represent actual investment returns.

## Chosen approach

Add `/demo` as a self-contained scenario. A pure TypeScript engine owns integer token balances, a synthetic swap-reserve pair, one separate illustrative LP position, pending principal withdrawals, and an example fee credit. The swap reserve and LP position are independent teaching fixtures; LP value is not derived from the synthetic reserve. The React view calls only this engine and stores state in memory; reload and **Reset demo** restore the initial fixture. It never calls `fetch`, `window.ethereum`, a signer, or a transaction API. A visible banner and every receipt identify values as simulated. Links to `/explore`, `/pools`, `/swap`, and `/positions` let a reviewer compare this walkthrough with real read-only Polygon data.

The synthetic swap starts with a 1,000 USDC / 1 WETH wallet and a separate 2,500,000 USDC / 1,000 WETH constant-product teaching reserve. It uses a 0.05% input fee and integer rounding. It is deliberately called an **illustrative AMM**, not a Uniswap v3 quote: v3 concentrated-liquidity math, tick crossings, gas and execution depend on live state. The UI shows estimated output, a slippage minimum, fee and balances before the user clicks **Simulate swap**. Changing amount or direction invalidates the preview. Failed input or insufficient balance never changes state.

LP actions demonstrate the state sequence: create with a fixed 100 USDC + 0.04 WETH fixture, increase by 25 USDC + 0.01 WETH, remove half or all liquidity, collect owed principal and a separately labeled example fee, then close an empty position. A decrease accrues principal owed but does not immediately credit wallet balances. The explicit example-fee action credits 0.25 USDC + 0.0001 WETH once; it is not derived from a swap, APR, or pool liquidity. Collect credits wallet balances exactly once. Each action returns a local receipt and updated balances; no transaction hash is fabricated.

## Interface and visual design

Use the token-launchpad reference: black canvas, `#D4FF2B` primary action, near-square cards/controls and monospaced amounts. Desktop presentation is the acceptance focus; mobile visual review remains deferred per the owner's earlier instruction. The demo should be understandable with keyboard and screen reader: labeled inputs, status and error regions, disabled impossible actions, and visible reset. Distinguish simulated amounts from live Polygon observations in text, not only color.

## Test and acceptance boundary

Pure engine tests cover decimal parsing, exact integer rounding, both swap directions, slippage, invalid input, insufficient balance, one-shot collection, partial/full removal and position closure. Component tests cover labels, invalidation and action states. Browser checks confirm no wallet prompt, no network request and a complete swap/LP walkthrough. Existing test, typecheck, lint and build gates remain. The previous Anvil fork lifecycle remains the contract-level companion evidence; the UI simulator is not evidence of real contract execution.

## Testnet later

Uniswap's [Trading API supports Base Sepolia, Ethereum Sepolia and Unichain Sepolia](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains), while Polygon Amoy is not on that API list. A testnet adapter requires its own token identity, pool liquidity, router/manager deployment, RPC, faucet assets and receipt checks. Do not reuse Polygon addresses or silently point `/demo` at testnet. Add a separately named testnet milestone only after a candidate pool and assets are verified. This preserves the standalone demo even when an external testnet or faucet is unavailable.
