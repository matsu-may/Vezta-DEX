# MetaMask delegated execution on Base Sepolia

## Intent and authorization

Owner explicitly requested EIP-7702 support after the installed MetaMask repeatedly wrapped reviewed approvals. Preserve the standalone desktop demo, wallet-owned signatures, exact approvals and individual swap/LP actions. Existing authorization to make routine choices and continue autonomously applies; implementation proceeds in the current demo checkout, preserving owner edits. This changes the wallet verification boundary and needs a written design and tests.

## Observed profile

Hash `0x889a6ff469519954beb459f2ce04dfabb4bd957e6b5c00b7b05230fbe7fbe3b1` successfully approves 1 USDC to the curated router. Its outer sender is a relayer, destination is MetaMask DelegationManager `0xdb9b1e94b5b69df7e401ddbede43491141047db3`, and authority `0x2c90304a4A0570221af2d997ccAc8f1Bc722D99a` authorizes `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`. The wrapper has one root permission, one SINGLE/DEFAULT execution, ANY_DELEGATE and exactly two signed caveats: LimitedCallsEnforcer `0x04658b29f6b82ed55274221a06fc97d318e25416` with limit 1; ExactExecutionEnforcer `0x146713078d39ecc1f5338309c28405ccf85abfbb` binding the complete packed target/value/calldata. Both caveat arguments are empty. Those v1.3.0 contracts are the initial allowlist; arbitrary smart accounts/EntryPoint batches are outside scope.

## Verification boundaries

1. The application still reviews and submits one direct token/router/manager action. MetaMask may wrap it; the returned original hash is retained before any new action.
2. Canonically decode `redeemDelegations(bytes[],bytes32[],bytes[])`: all arrays length 1; one canonical root delegation; exact all-zero 32-byte mode; packed execution equals the reviewed target, zero value and complete calldata. No extra calls, permissions, caveats, trailing bytes or TRY/BATCH mode.
3. Recover the root EIP-712 signature under DelegationManager / version 1 / chain 84532 / pinned manager. Require 65 bytes, low-s, v27/28 and signer equal to the reviewed owner. ANY_DELEGATE is accepted only with the two exact signed caveats above. Compute the struct hash independently for event/counter binding.
4. Support the observed outer type-4 and subsequent type-2 relayed transactions. Outer chain/value/access list, positive bounded gas/fees, canonical receipt identity and effective fee math are validated independently from the inner owner's nonce/gas/caps. Authorization signatures bind authority/delegate/chain/nonce, not execution; they supplement the signed exact-execution proof.
5. Pin runtime for manager, delegate and both enforcers. Independently rebuild metadata-listed sources; compare enforcer Base source with Base Sepolia runtime. Verify wallet delegation at execution time, accounting for end-of-block code: inspect the canonical block's authorizations and parent state, reject ambiguous same-block changes or unsupported delegation. No silent fallback if execution-time proof is unavailable.
6. For successful wrapped receipts, require exactly one matching IncreasedCount event (manager/redeemer/delegation struct hash/limit1/count1) and one matching RedeemedDelegation, then retain the existing token/NFT/pool economics, allowance/poststate, two-confirmation and reorg gates. Outer success alone never qualifies the inner action. Unsupported or malformed candidates remain unbound/unverified.

## Wallet and fee behavior

Allow empty account code or the exact pinned MetaMask delegation indicator in API and browser wallet checks; API additionally verifies pinned implementation runtime. Include delegation identity in LP state fingerprint. Browser never requests an upgrade, delegation signature or relayer action itself.

Retain the reviewed direct-action fee budget as a conservative owner funding requirement. A relayed outer transaction has a different nonce and fee envelope and is paid by its outer sender; show that payer and identify the observed outer L2 cost. Do not describe it as the reviewed direct budget or infer public charged L1/operator fees. Extra fee/payment caveats are unsupported.

## Recovery and historical approval

Persist new trusted swap action contexts, as LP already does, so API restart preserves their issuance and immutable economics. Never reconstruct an original trusted context from a client-supplied quote.

Old swap contexts may already be lost. Provide a separate read-only historical approval reconciliation: derive a canonical approval/reset from chain data, verify the same signed wrapper profile and actual allowance, then compare it to the browser's preserved original approval. Explicit owner acknowledgment can record reconciled approval evidence while retaining the original hash/history. Label original review unavailable; never call this an original-context receipt, and never use this path for swaps or LP writes. Archived approvals require the same explicit evidence/acknowledgment before an account block can be resolved.

## Threat model

| Scenario | Asset / assumption | Impact | Mitigation and verification | Owner |
|---|---|---|---|---|
| Outer success hides unrelated/failed inner call | Tokens; RPC data and wrapper decoder | False verified action | Canonical one-call profile, exact signed execution, default mode, existing economics; adversarial decoder/receipt tests | API/core |
| ANY permission has broad/replayable rights | All wallet assets; trusted enforcer runtime | Unreviewed authorization | Exactly LimitedCalls1 + ExactExecution, empty args, verified signature and consumed-count event; reject unknown caveats | Core/API |
| Delegate changes in same block | Wallet code; historical state | Wrong execution semantics | Parent code + canonical block authorization proof, runtime pins, reject ambiguity; fixture/fork tests | API |
| Relayer nonce/gas mistaken for owner fees | ETH; correct payer identity | Incorrect fee display/recovery | Separate inner action from outer envelope, show payer, preserve fee qualification flag | API/web |
| Restart/client fabricates original review | Recovery truth | False context verification | Persist server issuance; historical approval result separately labeled and explicitly acknowledged; no swap fallback | API/web |

## Qualification and limits

TDD for profile, signatures, extra calls/caveats, wrong delegation/chain/mode, authorizations, canonical events, fees/payer, historical reconciliation, persistent contexts and legacy compatibility. Use the actual public hash read-only plus local deterministic signed fixtures, disposable fork and browser mocks. No public broadcast or owner signatures by the agent. Mainnet, Vezta integration, mobile and general account-abstraction support remain outside this change.

Primary sources: [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), [MetaMask v1.3.0 release](https://github.com/MetaMask/delegation-framework/releases/tag/v1.3.0), verified source evidence under ignored `.local-evidence/eip7702-research/`. After demo acceptance, use the existing post-demo roadmap checkpoint.
