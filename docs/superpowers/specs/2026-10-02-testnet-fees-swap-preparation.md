# Base Sepolia fee budgets and unsigned swap preparation

## Intent and decisions

Continue phase 2 after owner approval-study acceptance in both directions (47564799 /47564808): blocked funding, no transaction and execution disabled are valid. Implement complete snapshot fee estimates and unsigned swap preparation; wallet submission and public receipts remain later gates. Existing standing authorization permits routine decisions/native execution with independent review. No UI, main Vezta integration, deployment or dependency update.

The installed viem 2.47.18 OP Stack total-fee helpers do not pin every read and can suppress operator-fee failures as zero. Instead query the canonical GasPriceOracle `0x420000000000000000000000000000000000000F` directly at the preparation block. Require code, `isFjord:true`, `isJovian:true`, valid results from `getL1FeeUpperBound(unsignedSize)` and `getOperatorFee(gasLimit)`. This uses the chain's system-predeploy trust boundary; it is not an independently rebuilt fee-oracle proof. Do not silently fall back on unsupported models/errors.

## Fee contract

Keep existing legacy unsigned transaction encoding. Serialize its actual chain/to/data/value/nonce/gas/gasPrice with viem; pass the unsigned byte length to the oracle (it adds its own signature allowance). Reject unsafe nonce conversion, unknown destination, invalid zero-value payload or oversized data.

Buffer execution gas by ceiling 120%; current gas price by 2×. Approval estimate bounds: 21,000–200,000, gas limit at most 250,000. Swap estimate bounds: 21,000–500,000, gas limit at most 650,000. Price must be positive and at most 1,000 gwei. L1 upper estimate must be positive; operator fee may be a successfully read zero. Both additional estimates must be uint256 and at most 0.1 ETH; total budget must be positive and less than 1 ETH. Budget = buffered L2 fee + 2×(L1 upper estimate + operator fee at buffered gas).

`totalFeeQualified:true` means all modeled snapshot fee components were obtained and bounded. It is not a guaranteed future charge/cap, an oracle audit or execution permission. Recheck at signing/submission remains mandatory. Low total ETH budget returns a valid blocked study with no transaction. Unfunded studies skip funded simulation/fees as before.

## Swap preparation contract

POST `/api/v1/testnet/base-sepolia/prepare` accepts the same strict `{intent,quoteId}` as approval. Read EOA, both token code/decimals, five runtime pins, input/native balances, exact allowance and mined/pending nonce at one fresh block no older than the bound quote. Require original quote and state canonical hashes, pending nonce, allowance and original expiry again after all work. Single-flight/25-second abort; no quote consumption/publication by late work.

Unfunded → `blocked`; allowance zero/nonexact → `approval-required` with only exact/reset kind and no transaction. A funded exact allowance permits work: validate fresh fixed-pool state and a pinned Quoter result (uint bounds, price direction/limits, full-input assumptions and impact after fee ≤100 bps), build the existing original quote's deadline-wrapped swap, and simulate that exact sender/to/data/value. Decode only one canonical returned bytes[] element holding one uint256 output, require equality with the fresh Quoter output and output ≥ originally reviewed minimum. Never lower the original minimum or extend its deadline. Estimate gas/complete fees; return unsigned transaction only if budget is covered and final checks pass.

Keep `executionEnabled:false`. HTTP remains loopback, no query, 4-KiB strict JSON and no-store; no browser executor or signature/send method. Preparation is repeatable diagnostics; one-time intent-bound final submission recheck/consume and receipt/recovery follow later. Funded cases require fork/public evidence in addition to unit tests.

## Evidence and references

Pure tests exercise independent fee arithmetic/rounding/overflow; wire tests check serialized transaction size, pinned oracle calls and no zero fallback. Reader tests cover both directions, exact/reset funding, false/malformed/mismatched simulation, original minimum/deadline, late expiry/reorg/nonce/allowance and timeout. CLI emits bounded rows, no wallet/calldata/provider secrets. A separate fee probe requires no wallet funds and does not claim real transaction gas qualification.

[Base fees](https://docs.base.org/specifications/transactions/network-fees), [OP Stack fee formulas](https://docs.optimism.io/op-stack/transactions/fees), [official GasPriceOracle](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L2/GasPriceOracle.sol) describe the current model; runtime getter qualification guards against unsupported deployments. Installed viem serialization/call/estimateGas code is the encoding reference; no package upgrade.
