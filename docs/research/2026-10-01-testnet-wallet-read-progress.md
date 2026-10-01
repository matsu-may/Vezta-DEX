# Testnet wallet reads: progress and owner checks

## Delivered scope

This phase-2 slice adds fresh wallet-bound quotes and wallet-state reads for Base Sepolia 84532, canonical test USDC/WETH and the selected Uniswap v3 0.3% pool. The standalone UI remains at its existing discovery/preview stage. Quote/state endpoints return no transaction calldata, signature or provider URL.

- Quote verifies chain, pinned contract presence/decimals, pool/factory identity, liquidity/price, tick spacing and router/quoter/manager configuration. The wallet must have empty code (EOA).
- Both directions use live QuoterV2 calls at that block. Bigint output/minimum and ≤100-bps impact after fee are checked; exhausted price limits are rejected.
- Opaque quote IDs bind wallet, chain, direction, input amount and slippage. The store holds at most 128 entries; original 30-second deadlines and synchronous once-only consumption prevent reuse. API restart loses quotes.
- State reads both tokens, native test ETH, router allowance and mined nonce at one block; pending nonce must remain equal. Zero balances are valid data, with funding false. Any nonzero allowance differing from exact input requires reset; reset submission/receipt/reread is still future work.
- Each reader permits one active study with a 25-second abort budget. Wrong identity, nonce movement, changed blocks, stale/late results and provider failures fail closed. HTTP accepts strict bounded JSON and returns no-store sanitized errors.

## Decisions retained

1. Keep the existing feature branch and a focused read-only slice. This leaves wallet execution unavailable until deployment, state/gas and simulation gates pass.
2. Keep direct v3/SwapRouter02 separate from Polygon Universal Router/Permit2. No automatic adapter fallback, new AMM deployment or Vezta integration.
3. Distinguish getter/configuration evidence from bytecode/source proof. [Official deployment references](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments) link core 1.0.0, periphery 1.0.0 and swap-router-contracts 1.1.0. No unverified artifact dependency was installed; tagged router source/artifact and deployed runtime matching remain open. Cost: execution cannot be enabled from these reads alone.
4. Add wallet-state diagnostics in the same slice so an unfunded wallet can be checked now. Native ETH positivity is only presence, not sufficient gas. Cost: gas/simulation remain separate follow-through work.

## Owner: two read-only commands

Run from `vezta-dex`; existing `pnpm install` and `BASE_SEPOLIA_RPC_URL` in `apps/api/.env` are sufficient. No funded wallet, API key, MetaMask prompt or running web/API server is needed for these CLI probes.

```bash
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e pnpm testnet:wallet-quote
DEX_SMOKE_WALLET=0xb4f286aeb57ab61af848f7c1619ff98144aed44e pnpm testnet:wallet-state
```

Quote should print two `testnet-wallet-quote-read-only` rows with intent/minimum/freshness/opaque-ID/configuration checks true. `runtimeVerified:false` and `executionEnabled:false` are expected, not errors. Quote and minimum are raw token units: USDC 6 decimals, WETH 18 decimals. Every quote has a new block-bound expiry; discovery samples cannot substitute for it.

State should print `testnet-wallet-state-read-only`, `verified:true`, chain 84532 and EOA. Both funding flags may be false for your empty wallet, and `allowanceKind:zero`, `approvalKind:approve` are expected. This verifies reads, not readiness to trade. A pending nonce must settle before a state check can qualify.

If either command returns unavailable, share only its bounded JSON `code`; do not share RPC credentials. `TESTNET_QUOTE_STALE`/`TESTNET_STATE_STALE` indicate old blocks or reads that outlived the deadline; refresh instead of increasing the lifetime. `TESTNET_CONFIGURATION_INVALID` or `TESTNET_BLOCK_CHANGED` require investigation before any write.

## Private API

Restart `pnpm dev` after changes. POST JSON to `/api/v1/testnet/base-sepolia/quote` or `/state` on port 3021 with `{chainId:84532,wallet,tokenIn,tokenOut,amountIn,slippageBps:50}`. The quote result is `{quote,quoteId,priceImpactBps,qualification}`; state is `{state}`. Unsupported methods/query/body fields are rejected. These are private loopback endpoints; a browser execution proxy and same-origin controls are future work.

## Evidence and remaining gates

Local verification: 546 Vitest +85 Node tests, typecheck, lint and build passed. Independent read-only review of `2dfd03e..d005b12` found no Critical/Important/Minor defect. The agent's live wallet-quote probe returned `TESTNET_RPC_UNAVAILABLE`; no owner result for the new probes is recorded yet. Existing owner depth/preview evidence remains historical and distinct. Existing Next workspace-root and ESLint React-detection warnings persist; no new failure was introduced.

Phase 2 still needs artifact/runtime proof, gas estimates, wallet-bound simulation/recheck, executable approval/reset receipt handling and preparation endpoints. Phases 3–6 (wallet swaps/recovery, Base Sepolia LP lifecycle, integrated desktop product, final acceptance) remain open. No need to obtain real USDC; faucet assets will be needed only for the later owner-operated testnet transaction checks.

## Independent-review scope rulings

These gates were considered and retained explicitly, rather than counted as verified:

- Artifact installation, exact tagged source/ABI correspondence, runtime matching and authenticity: separate deployment evidence before execution. Cost if omitted: trust in the wrong deployed code.
- Live provider/pool/balance/owner CLI results: pending host evidence. Cost if omitted: local tests may conceal real provider or liquidity failure.
- Sufficient gas, wallet-bound simulation and pre-submit rechecks: separate preparation slice. Cost if omitted: unfunded or stale execution could be exposed.
- Executable preparation endpoints and stored-ID consumer: remain absent until prerequisites qualify. Cost: no wallet swap yet.
- Approval/reset confirmation, allowance rereads and residue: later explicit wallet controller work. Cost if omitted: incorrect approval state.
- Wallet connect/switch/rejection/signing/pending/revert/replacement/reload/rebroadcast: later controller and receipt work. Cost if omitted: incorrect or duplicate user action.
- Permit2 binding: not introduced by the direct-router allowance adapter. Cost if later added without a new design: signature/adapter confusion.
- LP lifecycle and out-of-range economics: later SDK-backed LP phase. Cost: LP demo remains incomplete.
- Index reconciliation: these reads use RPC directly; an indexer has not been added. Cost if indexing is later mixed silently: inconsistent data sources.
- Desktop/browser behavior and main Vezta API generation: no UI/main-app changes in this slice. Cost: integrated browser acceptance remains open.
- Public deployment/auth/same-origin/rate limiting: private loopback scope only; browser write proxy and public exposure need their own controls. Cost if exposed now: unqualified operational boundary.
- Contract/economic audit: integration review is not an audit. Cost if treated as one: unsupported security/economic assurance.

No minor findings were deferred. The branch `codex/hook-free-routing` is retained locally for continued work; the owner has not requested a merge or publication.
