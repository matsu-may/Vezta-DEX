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

If either command returns unavailable, share its bounded JSON row; do not share RPC credentials. Quote CLI failures now include `rpcDiagnostics.firstFailure` (method, allowlisted failure kind and optional HTTP status) plus method counts/timing. Error messages, URLs, request bodies, wallet addresses and revert bytes are omitted. This instrumentation introduces no retry, fallback or longer deadline. A null first failure means no source-method rejection was recorded; do not infer that the whole study succeeded, particularly after a study timeout. Counters are a snapshot: other concurrent reads may still be aborting.

`TESTNET_QUOTE_STALE`/`TESTNET_STATE_STALE` indicate old blocks or reads that outlived the deadline; refresh instead of increasing the lifetime. `TESTNET_CONFIGURATION_INVALID` or `TESTNET_BLOCK_CHANGED` require investigation before any write. Re-run only `testnet:wallet-quote` once after the pacing change; repeating wallet state is not needed for the supplied successful run. Avoid overlapping CLI probes and browser/server studies against the same RPC quota during this check.

## Private API

Restart `pnpm dev` after changes. POST JSON to `/api/v1/testnet/base-sepolia/quote` or `/state` on port 3021 with `{chainId:84532,wallet,tokenIn,tokenOut,amountIn,slippageBps:50}`. The quote result is `{quote,quoteId,priceImpactBps,qualification}`; state is `{state}`. Unsupported methods/query/body fields are rejected. These are private loopback endpoints; a browser execution proxy and same-origin controls are future work.

## Evidence and remaining gates

Initial slice verification: 546 Vitest +85 Node tests, typecheck, lint and build passed. Independent read-only review of `2dfd03e..d005b12` found no Critical/Important/Minor defect. The agent's live wallet-quote probe returned `TESTNET_RPC_UNAVAILABLE`. Existing owner depth/preview evidence remains historical and distinct. Existing Next workspace-root and ESLint React-detection warnings persist; no new failure was introduced.

### Owner evidence received 2026-10-01

| Check | Owner result | Qualification |
|---|---|---|
| USDC→WETH wallet quote | Block 47543042, time `2026-10-01T11:32:52.000Z`, expiry `11:33:22Z`; input 1000000, output 6075530877895544, minimum 6045153223506066, impact 3 bps; binding/freshness/configuration checks true | Forward live quote read passed at that observation; not a reusable current quote |
| WETH→USDC wallet quote | Initial `TESTNET_RPC_UNAVAILABLE`; follow-up `rpcDiagnostics.firstFailure` identifies `getDependencyConfiguration`, `kind:rate-limited`, HTTP 429 | Provider rejected a configuration read before reverse Quoter; host success after pacing remains pending |
| Wallet state | Block 47543051, time `2026-10-01T11:33:10.000Z`, EOA, zero allowance, approval kind approve, both funding flags false, verified true | Live read passed; unfunded state is valid, no funded execution qualified |

The follow-up forward quote also passed at block 47543583, observed `2026-10-01T11:50:54.000Z`, expiring `11:51:24Z`, with the same input/output/minimum and 3-bps impact. Its reverse study failed at common dependency reads; no reverse `quoteExactInput` had started. This is evidence of provider throttling, not a reason to change pools or fund the wallet.

The CLI exit 1 correctly reflects the failed reverse check. The quote source calls QuoterV2 without spending the wallet's balance; funding is assessed separately by wallet state. The supplied state flags establish insufficient USDC for the 1-USDC intent and no native ETH, not exact balances for both tokens. Runtime verification and execution remain false by policy.

Diagnostic follow-up verification: 549 Vitest +85 Node tests, typecheck, lint and web build passed. Tests cover nested viem timeout/429/revert/HTTP/abort classification, secret-safe cause handling, original result/error preservation, and a successful forward quote followed by a reverse Quoter timeout. The agent's instrumented CLI failed at `getChainId` with `kind:transport`, confirming its own network limitation, not the owner's reverse failure. Only CLI diagnostics changed; provider pacing/retries, quote TTL, contract policy and HTTP error response remain unchanged.

### RPC pacing decision

Confirmed HTTP 429 prompted a bounded scheduler shared by RPC origin across source factories within a process. Default: three request starts/second and at most two active requests; optional `BASE_SEPOLIA_RPC_RPS` is an integer 1–6, independent of the Uniswap API key's quota. Queue capacity is 128, registry capacity 32 origins, queue wait at most 25 seconds. Known-origin rate changes require a process restart. Study abort removes queued work and cancels active HTTP through its existing signal.

Admission happens before HTTP dispatch, so queue waiting does not consume the eight-second network timeout. The 30-second original quote lifetime and 25-/45-second study deadlines remain unchanged. No retry, identity-read skip, stale cache or fallback was added. Cost: reads take longer; simultaneous independent processes, slower providers or stricter/shared quotas can still reject or time out. Three starts/second leaves room for the existing four-pool discovery study; a slower configured rate can exceed its deadline. Local transport tests cover spacing across factories, cancellation, timeout after a long queue wait and four-pool/24-sample discovery with simulated 300-ms RPC latency. Host rerun remains the live qualification gate.

Pacing verification: 559 Vitest +85 Node tests, typecheck, lint and build passed. These results verify local behavior; they do not establish that the owner's provider now accepts both quote directions.

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
