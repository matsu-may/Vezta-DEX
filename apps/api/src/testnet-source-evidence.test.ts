import { expect, it } from "vitest";
import { prepareTestnetSourceEvidence } from "./testnet-source-evidence";
import { sourceBundle, sourceFixture, snapshotFixture } from "./testnet-source.test-helper";

it("prepares literal compiler input while preserving settings and withholding runtime qualification", () => {
  const fixture = sourceFixture(); const before = structuredClone(fixture);
  const result = prepareTestnetSourceEvidence("router", fixture, sourceBundle);
  expect(result.input).toMatchObject({ language: "Solidity", sources: {
    "contracts/SwapRouter02.sol": { content: "pragma solidity =0.7.6; contract SwapRouter02 {}" } },
    settings: { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul", remappings: ["@x/=vendor/x/"],
      outputSelection: { "*": { "": ["ast"] }, "contracts/SwapRouter02.sol": { SwapRouter02: ["metadata", "evm.bytecode", "evm.deployedBytecode"] } } } });
  expect(result.summary).toMatchObject({ role: "router", chainId: 84532, sourceCount: 1, compilerVersion: "0.7.6+commit.7338295f",
    sourceGraphValidated: true, snapshotAvailable: false, runtimeSnapshotMatches: null,
    independentRebuildVerified: false, runtimeVerified: false, executionEnabled: false });
  expect(result.summary.inputSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(fixture).toEqual(before);
  expect(prepareTestnetSourceEvidence("router", result.payload, sourceBundle).summary.inputSha256).toBe(result.summary.inputSha256);
});

it("rejects wrong deployment, unverified source, compiler and target mismatch", () => {
  const mutations = [
    (x: ReturnType<typeof sourceFixture>) => { x.chainId = "137"; },
    (x: ReturnType<typeof sourceFixture>) => { x.address = sourceBundle[1].address; },
    (x: ReturnType<typeof sourceFixture>) => { x.runtimeMatch = "similarity_match"; },
    (x: ReturnType<typeof sourceFixture>) => { x.compilation.compilerVersion = "0.8.26+commit.8a97fa7a"; },
    (x: ReturnType<typeof sourceFixture>) => { x.compilation.language = "Vyper"; },
    (x: ReturnType<typeof sourceFixture>) => { x.metadata.settings.compilationTarget["contracts/SwapRouter02.sol"] = "SwapRouter"; },
    (x: ReturnType<typeof sourceFixture>) => { x.runtimeBytecode.onchainBytecode = "0x0"; },
  ];
  for (const mutate of mutations) { const value = sourceFixture(); mutate(value);
    expect(() => prepareTestnetSourceEvidence("router", value, sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID"); }
});

it("rejects altered/missing/remote graph sources and UTF-8 size overflows", () => {
  const original = sourceFixture();
  for (const sources of [
    { "contracts/SwapRouter02.sol": { content: "modified" } },
    {}, { "contracts/SwapRouter02.sol": { urls: ["https://example.invalid/import.sol"] } },
    { "contracts/SwapRouter02.sol": { content: "é".repeat(2000001) } },
    Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`file${i}.sol`, { content: "x" }])),
    { ["x".repeat(513)]: { content: "x" } },
  ]) expect(() => prepareTestnetSourceEvidence("router", { ...original, stdJsonInput: { ...original.stdJsonInput, sources } }, sourceBundle))
    .toThrow("SOURCE_EVIDENCE_INVALID");
  expect(() => prepareTestnetSourceEvidence("router", null, sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID");
  expect(() => prepareTestnetSourceEvidence("router", original, sourceBundle.slice(1))).toThrow("SOURCE_EVIDENCE_INVALID");
});

it("binds exact source runtime to a complete historical snapshot without promoting execution", () => {
  const result = prepareTestnetSourceEvidence("router", sourceFixture(), sourceBundle, snapshotFixture());
  expect(result.summary).toMatchObject({ snapshotAvailable: true, runtimeSnapshotMatches: true,
    blockNumber: "123", independentRebuildVerified: false, runtimeVerified: false, executionEnabled: false });
  expect(JSON.stringify(result.summary)).not.toContain("pragma");
  expect(JSON.stringify(result.summary)).not.toContain("runtimeBytecode");
});

it("rejects forged snapshot inventory, code/hash flags and selected runtime mismatch", () => {
  const cases = [
    { ...snapshotFixture(), chainId: 137 }, { ...snapshotFixture(), version: 2 },
    { ...snapshotFixture(), blockHash: `0x${"00".repeat(32)}` },
    { ...snapshotFixture(), observedAt: "2026-10-01T09:00:00.000Z" },
    { ...snapshotFixture(), contracts: snapshotFixture().contracts.slice(1) },
    { ...snapshotFixture(), contracts: [snapshotFixture().contracts[0], ...snapshotFixture().contracts.slice(0, 4)] },
    { ...snapshotFixture(), contracts: snapshotFixture().contracts.map(c => ({ ...c, runtimeHash: `0x${"00".repeat(32)}` })) },
    { ...snapshotFixture(), contracts: snapshotFixture().contracts.map(c => ({ ...c, artifactRuntimeExactMatch: true })) },
  ];
  for (const snapshot of cases) expect(() => prepareTestnetSourceEvidence("router", sourceFixture(), sourceBundle, snapshot)).toThrow("SOURCE_SNAPSHOT_INVALID");
  expect(() => prepareTestnetSourceEvidence("router", { ...sourceFixture(), runtimeBytecode: { onchainBytecode: "0x6002" } }, sourceBundle, snapshotFixture()))
    .toThrow("SOURCE_RUNTIME_MISMATCH");
});
