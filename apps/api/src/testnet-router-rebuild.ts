import { keccak256 } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { prepareTestnetSourceEvidence } from "./testnet-source-evidence";
import type { PinnedTestnetArtifact } from "./testnet-artifacts";

export const TESTNET_ROUTER_COMPILER_VERSION = "0.7.6+commit.7338295f.Emscripten.clang";
// ethereum/solc-bin gh-pages/bin/list.json, release soljson-v0.7.6+commit.7338295f.js.
export const TESTNET_ROUTER_COMPILER_SHA256 = "b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2";
export class TestnetRebuildError extends Error {
  constructor(readonly code: "REBUILD_COMPILER_INVALID" | "REBUILD_OUTPUT_INVALID" | "REBUILD_SETTINGS_INVALID"
    | "REBUILD_SNAPSHOT_REQUIRED" | "REBUILD_COMPILE_UNAVAILABLE" | "REBUILD_INVALID_OPTION") { super(code); }
}
const check = (ok: unknown): void => { if (!ok) throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID");
  return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(object(v)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])) : v;
  return JSON.stringify(normalize(value));
}
const sameKeys = (a: object, b: object) => canonical(Object.keys(a).sort()) === canonical(Object.keys(b).sort());
export function assertTestnetRouterCompiler(version: unknown, hash: unknown): void {
  if (version !== TESTNET_ROUTER_COMPILER_VERSION || hash !== TESTNET_ROUTER_COMPILER_SHA256)
    throw new TestnetRebuildError("REBUILD_COMPILER_INVALID");
}

export function prepareTestnetRouterRebuild(value: unknown, snapshot: unknown, bundle: readonly PinnedTestnetArtifact[]) {
  if (snapshot === undefined) throw new TestnetRebuildError("REBUILD_SNAPSHOT_REQUIRED");
  const prepared = prepareTestnetSourceEvidence("router", value, bundle, snapshot);
  const settings = Object.fromEntries(Object.entries(prepared.input.settings).filter(([key]) => key !== "outputSelection"));
  const expected = { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul",
    metadata: { bytecodeHash: "none" }, libraries: {}, remappings: [] };
  if (prepared.summary.compilerVersion !== "0.7.6+commit.7338295f"
    || prepared.summary.compilationTarget !== "contracts/SwapRouter02.sol:SwapRouter02" || canonical(settings) !== canonical(expected))
    throw new TestnetRebuildError("REBUILD_SETTINGS_INVALID");
  return prepared;
}

/** Locally compiled output only. Every immutable slot is mapped, patched and compared; no byte masking. */
export function verifyTestnetRouterRebuild(value: unknown, snapshot: unknown, output: unknown,
  compilerVersion: unknown, bundle: readonly PinnedTestnetArtifact[]) {
  assertTestnetRouterCompiler(compilerVersion, TESTNET_ROUTER_COMPILER_SHA256);
  const prepared = prepareTestnetRouterRebuild(value, snapshot, bundle);
  try {
    const result = object(output); const errors = result.errors ?? [];
    check(Array.isArray(errors) && errors.length <= 200);
    const warnings = (errors as unknown[]).map(object);
    check(warnings.every(e => e.severity === "warning"));
    const contracts = object(result.contracts); check(sameKeys(contracts, { "contracts/SwapRouter02.sol": null }));
    const target = object(contracts["contracts/SwapRouter02.sol"]); check(sameKeys(target, { SwapRouter02: null }));
    const contract = object(target.SwapRouter02); check(typeof contract.metadata === "string" && contract.metadata.length <= 2000000);
    const metadata = object(JSON.parse(contract.metadata as string));
    check(object(metadata.compiler).version === prepared.summary.compilerVersion);
    const sources = object(result.sources); const hashes = object(metadata.sources);
    check(sameKeys(sources, prepared.input.sources) && sameKeys(hashes, prepared.payload.metadata.sources));
    for (const [path, hash] of Object.entries(prepared.payload.metadata.sources)) check(object(hashes[path]).keccak256 === hash.keccak256);
    const settings = Object.fromEntries(Object.entries(prepared.input.settings).filter(([key]) => key !== "outputSelection"));
    check(canonical(metadata.settings) === canonical({ ...settings, compilationTarget: { "contracts/SwapRouter02.sol": "SwapRouter02" } }));
    const evm = object(contract.evm); const deployed = object(evm.deployedBytecode); const creation = object(evm.bytecode);
    check(Object.keys(object(deployed.linkReferences)).length === 0 && Object.keys(object(creation.linkReferences)).length === 0);
    for (const code of [deployed.object, creation.object]) check(typeof code === "string" && code.length <= 131072 && /^(?:[a-fA-F0-9]{2})+$/.test(code));
    const runtime = (deployed.object as string).toLowerCase(); const refs = object(deployed.immutableReferences);
    const periphery = "@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol:PeripheryImmutableState";
    // Observed zero factoryV2 is an explicit v3-only deployment constraint; no v2 execution is qualified.
    const expected: Record<string, string> = {
      [`${periphery}:factory`]: C.v3Factory, [`${periphery}:WETH9`]: C.WETH.address,
      "contracts/base/ImmutableState.sol:ImmutableState:factoryV2": "0x0000000000000000000000000000000000000000",
      "contracts/base/ImmutableState.sol:ImmutableState:positionManager": C.v3PositionManager,
    };
    check(Object.keys(refs).length === 4);
    const values: Record<string, string> = {}; const seen = new Set<string>();
    for (const [path, source] of Object.entries(sources)) {
      const nodes = object(object(source).ast).nodes; check(Array.isArray(nodes));
      for (const scope of (nodes as unknown[]).map(object).filter(x => x.nodeType === "ContractDefinition")) {
        check(Array.isArray(scope.nodes));
        for (const node of (scope.nodes as unknown[]).map(object)) {
          if (node.nodeType !== "VariableDeclaration" || !Object.hasOwn(refs, String(node.id))) continue;
          check(Number.isSafeInteger(node.id) && Number(node.id) >= 0 && node.stateVariable === true && node.mutability === "immutable"
            && object(node.typeDescriptions).typeString === "address");
          const key = `${path}:${scope.name}:${node.name}`; const id = String(node.id);
          check(Object.hasOwn(expected, key) && !Object.hasOwn(values, id) && !seen.has(key));
          values[id] = expected[key].slice(2).toLowerCase().padStart(64, "0"); seen.add(key);
        }
      }
    }
    check(sameKeys(refs, values) && seen.size === 4);
    let patched = runtime; const ranges: Array<{ start: number; end: number }> = [];
    for (const [id, references] of Object.entries(refs)) {
      check(Array.isArray(references) && references.length > 0 && references.length <= 64);
      for (const reference of references as unknown[]) {
        const { start, length } = object(reference);
        check(Number.isSafeInteger(start) && Number(start) >= 0 && length === 32 && Number(start) + 32 <= runtime.length / 2);
        const begin = Number(start); const end = begin + 32;
        check(ranges.every(range => begin >= range.end || end <= range.start));
        check(runtime.slice(begin * 2, end * 2) === "00".repeat(32));
        ranges.push({ start: begin, end });
        patched = patched.slice(0, begin * 2) + values[id] + patched.slice(end * 2);
      }
    }
    check(`0x${patched}` === prepared.payload.runtimeBytecode.onchainBytecode.toLowerCase());
    return { ...prepared.summary, status: "testnet-router-rebuild-verified", compilerVersion,
      runtimeHash: keccak256(`0x${patched}`), runtimeBytes: runtime.length / 2,
      immutableVariableCount: seen.size, immutableReferenceCount: ranges.length, warningCount: warnings.length,
      configuration: { factoryV3: C.v3Factory, weth: C.WETH.address, factoryV2: expected["contracts/base/ImmutableState.sol:ImmutableState:factoryV2"],
        positionManager: C.v3PositionManager }, independentRuntimeMatch: true, independentCreationMatch: false,
      independentRebuildVerified: true, runtimeVerified: false, executionEnabled: false };
  } catch { throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); }
}
