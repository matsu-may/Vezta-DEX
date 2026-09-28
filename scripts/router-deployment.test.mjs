import assert from "node:assert/strict";
import test from "node:test";
import { inspectDeploymentEvidence } from "./router-deployment.mjs";

const address = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
const pins = { dispatcher: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", v4Interface: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" };
const snapshot = { chainId: 137, address, blockNumber: "0x123", blockHash: `0x${"11".repeat(32)}`, timestamp: "0x6ab9ad00", bytecode: "0x60006000" };
const contract = () => ({
  chainId: "137", address, runtimeMatch: "exact_match",
  runtimeBytecode: { onchainBytecode: "0x60006000" },
  metadata: { compiler: { version: "0.8.26+commit.8a97fa7a" }, settings: { compilationTarget: { "contracts/UniversalRouter.sol": "UniversalRouter" }, optimizer: { enabled: true, runs: 3000 }, evmVersion: "cancun" } },
  sources: { "contracts/base/Dispatcher.sol": { content: "hello" }, "lib/v4-periphery/src/interfaces/IV4Router.sol": { content: "hello" } },
});

test("records runtime and source evidence without claiming full deployment or calldata validation", () => {
  const result = inspectDeploymentEvidence(contract(), snapshot, pins);
  assert.equal(result.runtimeExactMatch, true);
  assert.equal(result.runtimeMatchesRpc, true);
  assert.equal(result.compilationTargetMatches, true);
  assert.equal(result.dispatcherMatchesPinnedHash, true);
  assert.equal(result.v4InterfaceMatchesPinnedHash, true);
  assert.equal(result.deployedSourceVerified, false);
  assert.equal(result.calldataValidated, false);
});
test("reports mismatched runtime and source hashes as false rather than certifying the router", () => {
  const value = contract();
  value.runtimeBytecode.onchainBytecode = "0x60006001";
  value.sources["contracts/base/Dispatcher.sol"].content = "changed";
  const result = inspectDeploymentEvidence(value, snapshot, pins);
  assert.equal(result.runtimeMatchesRpc, false);
  assert.equal(result.dispatcherMatchesPinnedHash, false);
});
test("refuses other contracts, chains and malformed RPC evidence", () => {
  for (const value of [{ ...contract(), chainId: "1" }, { ...contract(), address: "0x1111111111111111111111111111111111111111" }, { ...contract(), runtimeBytecode: {} }]) assert.throws(() => inspectDeploymentEvidence(value, snapshot, pins));
  assert.throws(() => inspectDeploymentEvidence(contract(), { ...snapshot, bytecode: "0x" }, pins));
  assert.throws(() => inspectDeploymentEvidence(contract(), { ...snapshot, chainId: 1 }, pins));
});
test("does not confuse an ABI/source basename collision or partial verification with exact evidence", () => {
  const value = contract();
  value.runtimeMatch = "match";
  value.sources["other/contracts/base/Dispatcher.sol"] = { content: "hello" };
  value.metadata.settings.compilationTarget = { "contracts/Other.sol": "UniversalRouter" };
  const result = inspectDeploymentEvidence(value, snapshot, pins);
  assert.equal(result.runtimeExactMatch, false);
  assert.equal(result.dispatcherMatchesPinnedHash, false);
  assert.equal(result.compilationTargetMatches, false);
});
