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

12. Restrict browser actions to canonical http://127.0.0.1:3020 and use a nonqueued origin-wide Web Lock plus identity-checked storage mutations — fixes multiple-controller and alias-origin recovery races — cost if wrong: unsupported lock environments and localhost-alias tabs must stop; separate profiles still require the owner to use one test session.

13. Bind each marker to a unique ID, exact EOA nonce and a closed pre-send block; reject an account with pending/different nonce and historical inclusion — distinguishes identical approval attempts — cost if wrong: concurrent account activity/RPC nonce disagreement blocks rehearsal; manual nonce overrides remain unverified.

14. Keep manually entered hashes ephemeral until canonical execution evidence validates the candidate, while wallet-returned hashes remain fixed — permits correcting typos without replacing original transactions or authorizing sends — cost if wrong: pending/reorged candidates require another manual read and are lost on reload until verified.

15. Actual installed MetaMask and signed Trading API compatibility stay owner-run gates — deterministic code tests cannot establish live compatibility — cost if wrong: wallet/API incompatibility remains undiscovered until owner checks, public release remains blocked.

16. Production finality and automatic replacement handling remain outside this local observation policy — retain two canonical confirmations/60-second wait with uncertainty preserved — cost if wrong: local confirmed observations may reorg and replacement needs manual investigation.

17. Reverse funded swaps remain a separate runbook and gate — accepted first rehearsal is capped USDC→WETH — cost if wrong: no funded WETH→USDC evidence before later implementation.

18. Public multi-instance caches, distributed limiting and abuse controls remain release work — approved flow is one local API process and public writes disabled — cost if wrong: current stores/limiter cannot support replicas or unrestricted public load.

19. No provable original hash retains uncertainty and requires wallet-history investigation — no evidence authorizes another send — cost if wrong: recovery can remain blocked indefinitely without owner/explorer evidence.

20. Compromise of both application and wallet provider remains outside this local protection — no independent signing authority can be established inside those compromised components — cost if wrong: a compromised wallet/app can still cause loss; do not infer a security certification.

21. Do not migrate older recovery markers by inventing missing nonce/block/ID provenance — incomplete legacy metadata must block pending wallet-history investigation — cost if wrong: previous local test markers require manual investigation rather than automatic recovery.

## Deferred minor

- recovery panel omits the persisted accepted minimum and returned allowances; owner must note the quote minimum before submission and inspect actual allowance evidence separately.

## Coordination source

The browser adapter uses an exclusive Web Lock with `ifAvailable: true`, avoiding queued wallet actions, and holds it through completion of the asynchronous callback. Locks coordinate one origin; canonical browser-origin enforcement and owner use of one profile remain necessary. See [MDN LockManager.request](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).
