# Separate WETH → USDC Local Rehearsal

**Status:** Specification only. Do not expose a reverse wallet action yet. **Scope:** standalone `vezta-dex`, Polygon 137, native WETH to native USDC, one owner-operated exact-input swap. Public `/swap` remains read-only.

## Entry conditions and limit

Complete the USDC → WETH owner rehearsal first and verify its canonical receipt, actual WETH received, allowance, and remaining POL. Qualify the Polygon RPC read path before either funded trade. A new reverse intent must be selected and reviewed explicitly; do not automatically spend the first trade's proceeds. Limit the first reverse input to **0.0003 WETH** (300,000,000,000,000 wei) and the connected account's verified WETH balance, whichever is lower. This is a token-unit cap, not a guaranteed fiat-value cap. Show the live gas estimate and require enough POL before each wallet prompt. A zero or unusably small amount blocks the action.

The browser must start from a fresh WETH → USDC quote and a new quote ID. Never reuse the forward quote, approval, Permit2 signature, preparation, or persisted submission marker. Keep the 30-second quote expiry, exact-input trade type, 0.5% default slippage, CLASSIC route policy, and hook-free V4 restriction already specified for swaps.

## Validation and wallet sequence

1. Bind `chainId=137`, account, WETH token-in address, native USDC token-out address, and the integer input to one displayed intent. Parse input at **18** decimals and output/minimum at **6**; never use token symbols as identity. Display both addresses and the quote observation time.
2. Read WETH balance, POL gas balance, account code/nonce and WETH → Permit2 allowance at a pinned block. Accept only allowance zero or exactly the selected WETH input. If zero, review an `approve(Permit2, exactInput)` transaction targeting WETH; verify its canonical receipt and post-approval allowance, then discard the old quote.
3. Review a fresh Permit2 message for WETH, exact input, the approved router spender, expected nonce, chain 137 and deadlines. An already valid exact Permit2 allowance may be used only after an independently verified read. Wrong or broad existing permissions block this local flow; do not auto-revoke them.
4. Accept only a prepared transaction whose decoded path starts with WETH and ends with native USDC, spends the selected exact WETH input, delivers to the connected account, meets the accepted six-decimal minimum, has zero native value, uses the approved Polygon router, and passes a fresh local simulation. Unknown router actions, wrong recipients, stale quotes, or changed allowance/nonce fail closed.
5. The owner explicitly submits in MetaMask. Persist the original intent, hash or uncertain marker before/after the wallet call as in the forward flow. Never retry an ambiguous broadcast. Verify canonical receipt, exact WETH debit, USDC credit at or above the accepted minimum, gas, and post-swap allowances. Label any mismatch **unverified**, even if the receipt status is success.

## Required implementation evidence

- Unit tests for 18→6 decimal handling, WETH exact approval/Permit2, reversed pool path and recipient checks, stale/changed account or chain, failed simulation, rejected signature and submission, and receipt transfer direction.
- A deterministic mock browser run for desktop and mobile, including reload recovery and no automatic second send. If the UI is changed, use the standalone token launchpad's black/lime and numeric typography reference.
- Independent review of the two-direction validator and receipt logic; successful mock results cannot establish live economic execution.
- Owner-operated funded evidence only after the entry conditions above. Record public hashes and sanitized integer amounts; never save signatures, keys, or raw upstream payloads.

No reverse swap is required to diagnose the current RPC timeout. This specification supplies the implementation boundary after the forward live gate passes.
