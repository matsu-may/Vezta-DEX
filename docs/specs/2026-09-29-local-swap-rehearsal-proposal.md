# Local funded swap rehearsal — proposal

**Status:** Awaiting owner decision. This document does not enable wallet writes or authorize spending.

## Purpose and boundary

All installed-wallet read-only functional checks are owner-confirmed. The remaining integration evidence requires a real approval, Permit2 signature and swap. The [current swap spec](2026-09-27-trading-api-swap.md) deliberately gates public write controls on that evidence.

Proposal A adds a separate, explicit local development rehearsal to collect it. Public `/swap` stays read-only until the complete release gate passes. Work stays inside `vezta-dex`; main Vezta integration and deployment remain excluded. The owner controls every wallet prompt, funding and broadcast. Only public addresses and transaction hashes are needed; no seed phrase, private key or signature should be shared.

## Options

| Option | Work next | Trade-off |
|---|---|---|
| **A — dedicated test EOA, local rehearsal (recommended)** | Build and review a disabled-by-default local harness, complete mock-wallet tests, then let the owner perform one small funded swap | Obtains live compatibility and economic evidence; costs real gas and needs owner involvement |
| **B — defer funded rehearsal** | Continue controller and mock-wallet tests with write controls disabled | No spending; live signed calldata, approval and swap evidence remain unresolved |

## Proposed test limits

- Polygon 137; native USDC → WETH first; **1 USDC maximum input for the first swap**. Approval is exactly 1,000,000 base units to canonical Permit2. No automatic return swap, allowance reset or repeated submission.
- Existing policies remain: V2/V3/V4_NO_HOOKS, CLASSIC EXACT_INPUT, unchanged exact PermitSingle, 30-second quote TTL, approved router and fixed Polygon reads.
- Use a separate EOA with small test balances. The owner determines and funds native POL for the gas estimates shown by the wallet; no fixed gas cost is promised.
- For local observation only, propose **two canonical confirmations** and a **60-second pending wait** with serialized receipt reads. Timeout means delayed; retain the hash and keep recovery available. These test settings are not irreversible finality or a production default. Production finality, reload recovery and replacement handling still require their own release policy.

## Implementation before any funded action

1. Design the approval → receipt → new quote review → permit → preparation → submission controller. Keep transaction tracking bound to the original account and intent after form/account/network changes. Serialize reads or use monotonic sequencing.
2. Keep the harness opt-in, restricted to a process bound to loopback in development. Production must not expose its route or write controls; checking a browser hostname alone is insufficient. Do not add a flag that silently enables the public swap page.
3. Add deterministic mock-wallet coverage for rejection, changed account/network during prompts, expired quotes, changed allowance, blocked code, insufficient token/native balance, failed simulation, reverted/delayed receipts and replacement uncertainty. Never automatically retry signed requests or broadcasts. An unsupported allowance remains blocked; do not auto-revoke.
4. Independently validate the exact approval transaction and validated preparation response in the browser, recheck live account/chain/code/state before each prompt, and require an explicit owner action for each approval, signature and swap. After signing, check identity and expiry again before preparation.
5. Run full tests, typecheck, lint and build, obtain independent review, and provide a concrete owner runbook before asking for funding or a wallet transaction.

## Owner rehearsal after implementation and review

1. Connect the chosen test EOA. Read code, balances and allowance. If allowance is neither zero nor exactly the selected input, stop.
2. Review and submit the exact approval in MetaMask if needed. Validate its actual transaction identity, receipt and post-approval allowance at a canonical block. Record its hash and gas; a successful receipt alone does not prove allowance.
3. Discard the old quote. Fetch and explicitly review a fresh 1-USDC quote, then sign only the validated Permit2 message when required. If the prompt exceeds quote TTL or intent changes, discard that quote/signature and start with a fresh quote.
4. Call the existing single-use swap preparer. Verify target, chain, account, input, minimum output, deadline, simulation provenance and gas. A failed/expired preparation must not open a broadcast prompt.
5. Review and submit the validated transaction in MetaMask. Track the original hash; uncertainty, cancellation or replacement must never trigger another submission automatically.
6. Verify receipt, executed token transfers/balance changes, actual gas and post-swap allowances. Compare executed output with the accepted minimum; use Uniswap UI as an independent quote sanity check, not proof of execution. Refresh native gas balance after a confirmed revert too.

## Evidence and release gate

Record browser/MetaMask versions, masked account, accepted integer quote amounts, chain/block/time, public transaction hashes, status, gas and validated executed amounts/allowances. Never save raw signatures, sensitive calldata, API keys or wallet secrets.

A first successful USDC → WETH rehearsal does not prove the reverse direction or all failure cases. Keep the public release gate open until the remaining wallet scenarios, production receipt/recovery policy, both required trade directions and independent review are complete. The owner may stop at any wallet prompt without changing the software's transaction state to success.
