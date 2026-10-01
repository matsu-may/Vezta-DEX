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

it("accepts documented standard-JSON source hashes only after checking literal content and metadata", () => {
  const fixture = sourceFixture(); const path = "contracts/SwapRouter02.sol";
  const source = fixture.stdJsonInput.sources[path];
  const hashedSource = { ...source, keccak256: fixture.metadata.sources[path].keccak256 };
  const withHash = { ...fixture, stdJsonInput: { ...fixture.stdJsonInput, sources: { [path]: hashedSource } } };
  const result = prepareTestnetSourceEvidence("router", withHash, sourceBundle);
  expect(result.input.sources[path]).toEqual({ content: "pragma solidity =0.7.6; contract SwapRouter02 {}" });
  expect(result.summary).toMatchObject({ sourceGraphValidated: true, independentRebuildVerified: false, runtimeVerified: false, executionEnabled: false });
  expect(prepareTestnetSourceEvidence("router", result.payload, sourceBundle).summary.inputSha256).toBe(result.summary.inputSha256);
  for (const keccak256 of [`0x${"00".repeat(32)}`, null, 123]) {
    expect(() => prepareTestnetSourceEvidence("router", { ...withHash,
      stdJsonInput: { ...withHash.stdJsonInput, sources: { [path]: { ...hashedSource, keccak256 } } } }, sourceBundle))
      .toThrow("SOURCE_EVIDENCE_INVALID");
  }
  expect(() => prepareTestnetSourceEvidence("router", { ...withHash,
    stdJsonInput: { ...withHash.stdJsonInput, sources: { [path]: { ...hashedSource, urls: ["https://example.invalid/source.sol"] } } } }, sourceBundle))
    .toThrow("SOURCE_EVIDENCE_INVALID");
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

const stageCases: [string, () => unknown][] = [
  ["identity", () => null],
  ["identity", () => ({ ...sourceFixture(), chainId: "137" })],
  ["compiler", () => ({ ...sourceFixture(), metadata: { compiler: { version: "private upstream text" } } })],
  ["target", () => ({ ...sourceFixture(), metadata: { ...sourceFixture().metadata,
    settings: { compilationTarget: { "contracts/Other.sol": "Other" } } } })],
  ["source-graph", () => ({ ...sourceFixture(), stdJsonInput: { ...sourceFixture().stdJsonInput, sources: {} } })],
  ["source-content", () => ({ ...sourceFixture(), stdJsonInput: { ...sourceFixture().stdJsonInput,
    sources: { "contracts/SwapRouter02.sol": { content: "private modified source" } } } })],
  ["runtime", () => ({ ...sourceFixture(), runtimeBytecode: { onchainBytecode: "private malformed bytecode" } })],
];
it.each(stageCases)("reports the bounded %s rejection stage without exposing rejected data", (stage, fixture) => {
  let error: unknown;
  try { prepareTestnetSourceEvidence("router", fixture(), sourceBundle); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ code: "SOURCE_EVIDENCE_INVALID", stage });
  expect(JSON.stringify(error)).not.toContain("private");
});

it("distinguishes artifact and snapshot validation failures from source-provider rejection", () => {
  let artifactError: unknown; let snapshotError: unknown;
  try { prepareTestnetSourceEvidence("router", sourceFixture(), []); } catch (error) { artifactError = error; }
  try { prepareTestnetSourceEvidence("router", sourceFixture(), sourceBundle, {}); } catch (error) { snapshotError = error; }
  expect(artifactError).toMatchObject({ code: "SOURCE_EVIDENCE_INVALID", stage: "artifact" });
  expect(snapshotError).toMatchObject({ code: "SOURCE_SNAPSHOT_INVALID", stage: "snapshot" });
});
