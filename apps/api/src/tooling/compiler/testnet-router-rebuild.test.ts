import { expect, it } from "vitest";
import { keccak256 } from "viem";
import { verifyTestnetRouterRebuild, assertTestnetRouterCompiler, verifyTestnetSwapDependencyRebuild } from "./testnet-router-rebuild";
import { sourceBundle } from "../evidence/testnet-source.test-helper";
import { routerRebuildFixture, quoterRebuildFixture, factoryRebuildFixture, poolManagerRebuildFixture } from "./testnet-router-rebuild.test-helper";
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

it("verifies QuoterV2 using only its own factory/WETH bindings and complete runtime", () => {
  const f = quoterRebuildFixture(); const before = structuredClone(f);
  const result = verifyTestnetSwapDependencyRebuild("quoter", f.value, f.snapshot, f.output, version, sourceBundle);
  expect(result).toMatchObject({ status: "testnet-quoter-rebuild-verified", role: "quoter", immutableVariableCount: 2,
    immutableReferenceCount: 2, warningCount: 0, independentRuntimeMatch: true, runtimeVerified: false, executionEnabled: false });
  expect(result.configuration).toEqual({ factoryV3: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", weth: "0x4200000000000000000000000000000000000006" });
  expect(f).toEqual(before);
});

it("rejects router evidence and any extra immutable when selecting the quoter policy", () => {
  const router = routerRebuildFixture();
  expect(() => verifyTestnetSwapDependencyRebuild("quoter", router.value, router.snapshot, router.output, version, sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID");
  const quoter = quoterRebuildFixture();
  Object.assign(quoter.contract.evm.deployedBytecode.immutableReferences, { "3": [{ start: 1, length: 32 }] });
  expect(() => verifyTestnetSwapDependencyRebuild("quoter", quoter.value, quoter.snapshot, quoter.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
});

it("rejects changed quoter runtime bytes, settings, metadata and immutable addresses", () => {
  const mutations: Array<(f: ReturnType<typeof quoterRebuildFixture>) => void> = [
    f => { f.contract.evm.deployedBytecode.object = f.contract.evm.deployedBytecode.object.slice(0, -2) + "02"; },
    f => { f.metadata.settings.optimizer.runs = 200; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { f.metadata.sources["contracts/lens/QuoterV2.sol"].keccak256 = `0x${"00".repeat(32)}`; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { f.value.runtimeBytecode.onchainBytecode = f.value.runtimeBytecode.onchainBytecode.replace("4752ba5d", "4752ba5e");
      const row = f.snapshot.contracts.find(x => x.role === "quoter")!; row.runtimeBytecode = f.value.runtimeBytecode.onchainBytecode;
      row.runtimeHash = keccak256(row.runtimeBytecode as `0x${string}`); },
  ];
  for (const mutate of mutations) {
    const f = quoterRebuildFixture(); mutate(f);
    expect(() => verifyTestnetSwapDependencyRebuild("quoter", f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  }
});

it("verifies the factory's complete runtime with NoDelegateCall bound to its own address", () => {
  const f = factoryRebuildFixture(); const before = structuredClone(f);
  const result = verifyTestnetSwapDependencyRebuild("factory", f.value, f.snapshot, f.output, version, sourceBundle);
  expect(result).toMatchObject({ status: "testnet-factory-rebuild-verified", role: "factory", immutableVariableCount: 1,
    immutableReferenceCount: 1, independentRuntimeMatch: true, independentRebuildVerified: true,
    independentCreationMatch: false, runtimeVerified: false, executionEnabled: false });
  expect(result.configuration).toEqual({ factoryV3: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" });
  expect(f).toEqual(before);
});

it("rejects factory compiler output with altered bytes, settings, source hashes or unexpected immutables", () => {
  const mutations: Array<(f: ReturnType<typeof factoryRebuildFixture>) => void> = [
    f => { f.contract.evm.deployedBytecode.object = f.contract.evm.deployedBytecode.object.slice(0, -2) + "02"; },
    f => { f.metadata.settings.optimizer.runs = 1000000; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { f.metadata.sources["contracts/UniswapV3Factory.sol"].keccak256 = `0x${"00".repeat(32)}`; f.contract.metadata = JSON.stringify(f.metadata); },
    f => { Object.assign(f.contract.evm.deployedBytecode.immutableReferences, { "1": [{ start: 0, length: 32 }] }); },
    f => { f.value.runtimeBytecode.onchainBytecode = f.value.runtimeBytecode.onchainBytecode.replace("4752ba5d", "4752ba5e");
      const row = f.snapshot.contracts.find(x => x.role === "factory")!; row.runtimeBytecode = f.value.runtimeBytecode.onchainBytecode;
      row.runtimeHash = keccak256(row.runtimeBytecode as `0x${string}`); },
  ];
  for (const mutate of mutations) {
    const f = factoryRebuildFixture(); mutate(f);
    expect(() => verifyTestnetSwapDependencyRebuild("factory", f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  }
});

it("requires the factory's observed 800-run settings and rejects a different role's evidence", () => {
  const f = factoryRebuildFixture(); f.value.stdJsonInput.settings.optimizer.runs = 1000000;
  expect(() => verifyTestnetSwapDependencyRebuild("factory", f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_SETTINGS_INVALID");
  const q = quoterRebuildFixture();
  expect(() => verifyTestnetSwapDependencyRebuild("factory", q.value, q.snapshot, q.output, version, sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID");
});

it.each(["pool", "manager"] as const)("verifies %s using every typed immutable and all runtime bytes", role => {
  const f = poolManagerRebuildFixture(role); const before = structuredClone(f);
  const result = verifyTestnetSwapDependencyRebuild(role, f.value, f.snapshot, f.output, version, sourceBundle);
  expect(result).toMatchObject({ status: `testnet-${role}-rebuild-verified`, role, immutableVariableCount: role === "pool" ? 7 : 5,
    immutableReferenceCount: role === "pool" ? 7 : 5, independentRuntimeMatch: true, independentCreationMatch: false,
    independentRebuildVerified: true, runtimeVerified: false, executionEnabled: false });
  if (role === "pool") expect(result.configuration).toMatchObject({ fee: 3000, tickSpacing: 60,
    maxLiquidityPerTick: "11505743598341114571880798222544994" });
  else expect(result.configuration).toMatchObject({ tokenDescriptorProxy: "0x1E2A708040Eb6Ed08893E27E35D399e8E8e7857E" });
  expect(f).toEqual(before);
});

it.each(["pool", "manager"] as const)("rejects changed %s immutable values, AST types and compiler output", role => {
  const size = role === "pool" ? 7 : 5;
  for (let i = 0; i < size; i++) {
    const f = poolManagerRebuildFixture(role); const raw = f.value.runtimeBytecode.onchainBytecode;
    const offset = 2 + (1 + i * 32) * 2;
    f.value.runtimeBytecode.onchainBytecode = raw.slice(0, offset + 63) + (raw[offset + 63] === "0" ? "1" : "0") + raw.slice(offset + 64);
    const row = f.snapshot.contracts.find(x => x.role === role)!; row.runtimeBytecode = f.value.runtimeBytecode.onchainBytecode;
    row.runtimeHash = keccak256(row.runtimeBytecode as `0x${string}`);
    expect(() => verifyTestnetSwapDependencyRebuild(role, f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  }
  const f = poolManagerRebuildFixture(role);
  const file = role === "pool" ? "contracts/UniswapV3Pool.sol" : "contracts/base/ERC721Permit.sol";
  const declaration = f.output.sources[file].ast.nodes[0].nodes[0] as { typeDescriptions: { typeString: string } };
  declaration.typeDescriptions.typeString = "uint256";
  expect(() => verifyTestnetSwapDependencyRebuild(role, f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
  const changed = poolManagerRebuildFixture(role); changed.contract.evm.deployedBytecode.object += "00";
  expect(() => verifyTestnetSwapDependencyRebuild(role, changed.value, changed.snapshot, changed.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
});

it.each(["pool", "manager"] as const)("requires %s-specific settings, metadata and role identity", role => {
  const f = poolManagerRebuildFixture(role); f.value.stdJsonInput.settings.optimizer.runs = 1000000;
  expect(() => verifyTestnetSwapDependencyRebuild(role, f.value, f.snapshot, f.output, version, sourceBundle)).toThrow("REBUILD_SETTINGS_INVALID");
  const different = factoryRebuildFixture();
  expect(() => verifyTestnetSwapDependencyRebuild(role, different.value, different.snapshot, different.output, version, sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID");
  const wrongMetadata = poolManagerRebuildFixture(role); Object.values(wrongMetadata.metadata.sources)[0].keccak256 = `0x${"00".repeat(32)}`;
  wrongMetadata.contract.metadata = JSON.stringify(wrongMetadata.metadata);
  expect(() => verifyTestnetSwapDependencyRebuild(role, wrongMetadata.value, wrongMetadata.snapshot, wrongMetadata.output, version, sourceBundle)).toThrow("REBUILD_OUTPUT_INVALID");
});
