# Local wallet completion — decisions

These choices implement the owner-approved [plan](../superpowers/plans/2026-09-29-local-wallet-completion.md). Each entry records the rationale and cost if wrong. No choice releases public trading.

1. Work inline in the existing codex/hook-free-routing checkout — preserves the owner's ongoing local testing setup and approved session scope — cost if wrong: no second checkout isolates changes; scoped commits and preserved next-env maintain ownership.

2. Approve implementation of the distinct local rehearsal under the owner's six-step acceptance — each real wallet action still requires the owner's click; public writes stay gated — cost if wrong: local enablement could be misunderstood as production readiness, so document and test the gate.

3. Initial funded rehearsal is capped USDC→WETH at 1 USDC; public read-only quotes retain both directions — limits first live spend and follows the accepted proposal — cost if wrong: reverse funded execution needs a subsequent explicit runbook before release.

4. Extract existing pure decoder/signature/receipt logic into core with compatibility exports — browser validates the same policy without server imports — cost if wrong: shared dependency/bundle weight and extraction regressions; existing suites/typecheck cover compatibility.

5. Use narrow state/receipt endpoints and a bounded short-lived preparation cache for recheck — avoids browser RPC keys/general RPC proxy and avoids replaying signed Uniswap calls — cost if wrong: additional RPC/cache load; single-process deployment remains a limit.

6. Serialize all action/receipt work and require a new explicit click after gas cost increases — prevents overlapping prompts and unintended fee acceptance — cost if wrong: conservative locking/gas review can require requoting within the 30-second TTL.

7. Persist an uncertain marker before broadcast and restore only read-only metadata — prevents an interrupted or ambiguous wallet response becoming permission to resubmit — cost if wrong: blocked/corrupt recovery needs manual wallet-history inspection; signatures/quotes are deliberately lost across reload.

8. Retain original-account execution evidence and require actual digest/transfers/allowance before clearing a record — receipt success is insufficient proof — cost if wrong: conservative verification can require manual investigation after indexer/RPC lag or unrelated balance events.

9. Gate the local page/proxy on development plus loopback launcher configuration and validate actual same-origin requests — preserves public write gates and rejects remote/cross-origin use — cost if wrong: manually copying launcher flags into another server bypasses supported deployment assumptions; production remains hard-disabled.

10. Accept only consistent loopback forwarding headers that Next generates, and require fixed loopback API port3021 — avoids rejecting legitimate local requests while preventing redirected signed payloads — cost if wrong: alternate ports/proxies are unsupported until separately specified.

11. Replace permissive CI installation with frozen-lockfile installation — the pinned manifests/lock install successfully offline and CI must check the same dependency graph — cost if wrong: a manifest-only change now fails CI until its lock is updated.

## Review rulings

Pending the single independent whole-change review; any declined findings or deferred minors will be recorded here.
