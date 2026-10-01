import { expect, it } from "vitest";
import { verifyTestnetRouterRebuild, assertTestnetRouterCompiler } from "./testnet-router-rebuild";
import { sourceBundle } from "./testnet-source.test-helper";
import { routerRebuildFixture } from "./testnet-router-rebuild.test-helper";
const version = "0.7.6+commit.7338295f.Emscripten.clang";
const compilerHash = "b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2";

it("binds every compiler immutable to its source declaration and compares all historical runtime bytes", () => {
  const f = routerRebuildFixture(); const before = structuredClone(f);
  const result = verifyTestnetRouterRebuild(f.value, f.snapshot, f.output, version, sourceBundle);
  expect(result).toMatchObject({ chainId: 84532, blockNumber: "123", immutableVariableCount: 4, immutableReferenceCount: 4,
    independentRuntimeMatch: true, independentCreationMatch: false, runtimeVerified: false, executionEnabled: false, warningCount: 1 });
  expect(f).toEqual(before);
});

it("requires the exact official compiler version and binary fingerprint", () => {
  expect(() => assertTestnetRouterCompiler(version, compilerHash)).not.toThrow();
  for (const [v, hash] of [["0.7.6+commit.ffffffff.Emscripten.clang", compilerHash],
    [version + ".untrusted", compilerHash], [version, "00".repeat(32)]])
    expect(() => assertTestnetRouterCompiler(v, hash)).toThrow("REBUILD_COMPILER_INVALID");
});

it("rejects compiler errors, wrong settings/source hashes and linked libraries", () => {
  const mutations: Array<(f: ReturnType<typeof routerRebuildFixture>) => void> = [
    f => { f.output.errors[0].severity = "error"; },
    f => { f.metadata.settings.optimizer.runs = 200; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { f.metadata.sources["contracts/SwapRouter02.sol"].keccak256 = `0x${"00".repeat(32)}`; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { Object.assign(f.contract.evm.deployedBytecode.linkReferences, { "x.sol": { Lib: [{ start: 1, length: 20 }] } }); },
    f => { f.contract.evm.deployedBytecode.object = f.contract.evm.deployedBytecode.object.slice(0, -2) + "02"; },
  ];
  for (const mutate of mutations) {
    const f = routerRebuildFixture(); mutate(f);
    expect(() => verifyTestnetRouterRebuild(f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  }
});

it("rejects missing, duplicate, overlapping, out-of-range or prefilled immutable slots", () => {
  const mutations: Array<(f: ReturnType<typeof routerRebuildFixture>) => void> = [
    f => { f.contract.evm.deployedBytecode.immutableReferences["1"] = []; },
    f => { f.contract.evm.deployedBytecode.immutableReferences["1"][0].length = 20; },
    f => { f.contract.evm.deployedBytecode.immutableReferences["1"][0].start = 130; },
    f => { f.contract.evm.deployedBytecode.immutableReferences["2"][0].start = 1; },
    f => { f.contract.evm.deployedBytecode.object = "61" + f.contract.evm.deployedBytecode.object.slice(2, 4) + "01" + f.contract.evm.deployedBytecode.object.slice(6); },
    f => { Object.assign(f.contract.evm.deployedBytecode.immutableReferences, { "5": [{ start: 1, length: 32 }] }); },
    f => { f.output.sources["contracts/base/ImmutableState.sol"] = f.output.sources["@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol"]; },
  ];
  for (const mutate of mutations) {
    const f = routerRebuildFixture(); mutate(f);
    expect(() => verifyTestnetRouterRebuild(f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  }
});

it("requires a validated snapshot and the observed v3-only router settings", () => {
  const f = routerRebuildFixture();
  expect(() => verifyTestnetRouterRebuild(f.value, undefined, f.output, version, sourceBundle)).toThrow("REBUILD_SNAPSHOT_REQUIRED");
  f.value.stdJsonInput.settings.optimizer.runs = 200;
  expect(() => verifyTestnetRouterRebuild(f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_SETTINGS_INVALID");
});
