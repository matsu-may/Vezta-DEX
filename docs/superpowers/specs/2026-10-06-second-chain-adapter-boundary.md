# Second-chain adapter boundary

Preparation for phase 8; implementation activation awaits the owner chain choice.
Base Sepolia remains the executable public-testnet adapter. This design preserves
existing signed review/context/hash recovery; it does not mark another chain supported.

## Shared foundation implemented

`apps/api/src/testnet-read-client.ts` creates a viem public client with explicit
chain metadata and a closed read-method allowlist. It preserves the existing
1 MiB response bound before JSON decoding, cancellation, 8s network timeout,
zero network retries and shared origin pacing (1–6 RPS, at most two active calls).
The Base source and receipt fee CLI consume it. Supplying Unichain metadata is
unit-tested; this is connection plumbing, not live chain qualification.

## Qualification before activation

A server-owned chain record must contain chainId, native currency, explorer,
USDC/WETH identities and on-chain decimals; independently proven router/quoter/
factory/pool/manager runtime hashes, constructors/immutables and source/compiler
provenance; selected v3 fee/tick spacing and measured size/impact limits. Records
are keyed by chainId and address/protocol. Another chain cannot inherit Base pins
because addresses or contract names look alike.

Fresh quotes recheck actual chain, canonical block, all dependencies, pool
configuration and impact. The adapter supplies a chain-qualified fee model,
transaction envelopes, simulation and confirmation policy. Two Base confirmations
are an inclusion policy, not a portable finality rule. OP Stack family membership
alone does not qualify an active fork, operator fee or delegation deployment.

## Concrete migration surface

| Layer | Current Base implementation | New-chain requirement |
|---|---|---|
| Core intent/calldata | `testnet-swap.ts`, `testnet-lp-wallet.ts`, `testnet-metamask.ts` | Explicit supported-chain discriminant and qualified deployment record; preserve legacy 84532 serialization |
| RPC/state/runtime | `base-sepolia-source.ts`, `testnet-runtime.ts`, rebuild/source evidence modules | Adapter-specific state + exact runtime verifier; shared read client only handles transport |
| Quote/review | `testnet-swap-quote.ts`, `testnet-approval.ts`, `testnet-swap-preparation.ts`, `testnet-lp-wallet.ts` | Bind chain, tokens, pool, spender, minimum, fee model and expiry at every transition |
| Backend stores | `testnet-quote-store.ts`, `testnet-action.ts`, `testnet-lp-wallet-store.ts` | Chain included in identity and persisted context; reject cross-chain lookup/replay |
| Receipt/delegation | swap/LP receipt readers + MetaMask runtime verifiers | Verify original chain/block/transaction/event and exact reviewed inner call; independent account implementation proof |
| Browser | wallet controller/contracts/storage and local activity | Select network explicitly; account/chain/input change invalidates unsigned reviews; fixed chain-specific explorer links |

The existing Base endpoints and storage records remain compatible. Do not bulk
rewrite old records or reuse a quote/context ID on another chain. Chain migration
must be tested against saved legacy Base fixtures before the new chain is enabled.

## Recovery policy

An unresolved swap or LP submission keeps its original chain, account, context
and hash. Read-only browsing may select another chain, but a global known-chain
submission lock blocks another wallet write until the original outcome is
resolved or explicitly archived through the existing review policy. Recovery
checks the original chain; wallet switching never converts the record.
History remains account+chain scoped and is separate from this lock. Chain writes
must persist returned hashes before optional local-history writes.

## Activation sequence and tests

1. Owner chooses the candidate; record exact official mapping and independently
   rebuild deployed dependencies. Read-only candidate work requires no faucet.
2. Add chain-qualified adapter/configuration and schemas without enabling writes.
3. Test wrong-chain RPC/wallet, identical symbols/addresses on another chain,
   wrong decimals/runtime/fee model, stale blocks, replay, legacy recovery and
   chain/account changes during pending prompts.
4. One owned local fork proves both swap directions and full LP lifecycle, exact
   approvals, original receipt tracking and restart recovery. Browser mocks
   prove explicit network switching and no resend after reload.
5. Enable explicit testnet demo gate only after independent checks pass; request
   the owner's faucet-funded public acceptance in the consolidated final guide.

Cross-chain swaps, bridges, multihop routing and mainnet activation are separate.
Primary deployment links and measured candidate pools are in
`../../research/2026-10-05-second-testnet-feasibility.md`.
