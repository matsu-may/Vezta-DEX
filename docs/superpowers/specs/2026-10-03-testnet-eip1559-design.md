# Standard-wallet EIP-1559 compatibility

## Intent and scope

Owner authorized the proposed standard-wallet compatibility work and autonomous routine choices. Make existing standalone Base Sepolia swap and LP flows prepare, submit and verify direct EIP-1559 transactions. Preserve old legacy recovery records. Desktop routes and Uniswap deployments remain unchanged; no public signing, mainnet or Vezta integration.

Public hashes `0x16a79800ca68e48299ea19cf903d0ff50de202198c528f6337f573ccabe44b25` and `0xc86c7ab4a67851599dc72ede4b0293d4f3987e7e86d9da97dcd81e8c9d4612e4` were read through RPC: successful USDC approvals of 1000000 to the curated router, wrapped EIP-7702 type 0x4 and relayer sender. These are not direct verified demo receipts. Disabling smart-account settings cannot rewrite these old transactions.

## Fee contract

Retain `gasPrice` as the existing DTO's reviewed per-gas budget ceiling for compatibility. New DTOs also carry `feeModel: "eip1559"`, `maxFeePerGas` equal to that ceiling and `maxPriorityFeePerGas`. The three fields are all present or all absent; absent means historical legacy. Reject mixed/incomplete fields, nonpositive or excessive fees, priority greater than max fee, and conflicting gas-budget/transaction descriptors. These DTOs are reviewed plans, not raw RPC envelopes.

Production source reads base fee from the pinned block and current priority suggestion. Max fee is `2 * baseFeePerGas + maxPriorityFeePerGas`; keep the existing 2e12 wei ceiling and gas/buffer bounds. Mock sources without the new optional fee capability retain legacy behavior. LP recheck must preserve original fields, confirm current base plus priority fits the original cap, and recalculate additional fees using the original envelope. Swap/approval issuance plans fees at the study block; the resulting reviewed action is immutable through submission and recovery. No silent fallback when production EIP-1559 reads fail.

Serialize the type-2 envelope for L1/operator estimates. Wallet requests explicitly contain type 0x2, maxFeePerGas/maxPriorityFeePerGas and no gasPrice. Historical requests explicitly contain type 0x0 and gasPrice. Show model/max fee/priority fee in review.

## Receipt and recovery

Match direct transaction model and all original identities, nonce, gas, calldata and fee caps. EIP-1559 receipt effective gas price must equal `min(maxFeePerGas, receiptBlockBaseFee + maxPriorityFeePerGas)` and remain within the reviewed ceiling. Reject nonempty access lists or authorization/wrapped envelopes not reviewed. Preserve two-confirmation, canonical block, event, NFT and payment checks. Historical legacy fee equality stays exact.

No change to automatic signing, archive eligibility or archived-wallet blocking. Old unsupported hashes remain unresolved. Never erase recovery or infer verified execution from a successful explorer status. Smart-account conversion can occur after preflight; type 0x4 remains unsupported and must explain why, rather than instructing endless wallet changes.

## Qualification

TDD for partial/mixed fee descriptors, original fee mutation, effective fee calculations, unsupported types, receipt/recovery binding, exact wallet RPC parameters and public-consumer fork harnesses. Run relevant core/API/web tests, full typecheck/lint/build and repository-required full tests once at integration. Use disposable local fork when host services permit; no owner funds or public broadcast. Existing historical source/runtime proof is reused.

## Post-demo checkpoint

Before resuming broader DEX work, review the complete roadmap against accepted public-demo evidence. Prefer pinned official SDK packages and deployed liquidity. Clone source selectively at pinned commits for debugging, ABI/calldata/source comparison and protocol tests; v4-core/periphery only when an actual v4/hook adapter needs them. A full AMM fork/deployment is a separate product/security decision. Cloning Uniswap does not solve wallet-envelope compatibility.
