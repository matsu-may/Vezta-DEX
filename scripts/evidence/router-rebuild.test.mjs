import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { prepareRouterInput, verifyRouterRebuild } from "./router-rebuild.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { encodeAbiParameters, parseAbiParameters, keccak256, stringToHex } = require("viem");
const router = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
const pins = { dispatcher: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", v4Interface: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" };
// Independent fixture source fingerprint; both fixture files contain "hello".
const ctorAbi = parseAbiParameters("(address permit2,address weth9,address v2Factory,address v3Factory,bytes32 pairInitCodeHash,bytes32 poolInitCodeHash,address v4PoolManager,address v3NFTPositionManager,address v4PositionManager,address spokePool)");
const ctor = {
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3", weth9: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  v2Factory: "0x9e5a52f57b3038f1b8eee45f28b3c1967e22799c", v3Factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
  pairInitCodeHash: "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f", poolInitCodeHash: "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54",
  v4PoolManager: "0x67366782805870060151383f4bbff9dab53e5cd6", v3NFTPositionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  v4PositionManager: "0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9", spokePool: "0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096",
};
const bindings = [
  ["contracts/modules/PaymentsImmutables.sol", "PaymentsImmutables", "PERMIT2", ctor.permit2],
  ["contracts/modules/PaymentsImmutables.sol", "PaymentsImmutables", "WETH9", ctor.weth9],
  ["contracts/modules/uniswap/UniswapImmutables.sol", "UniswapImmutables", "UNISWAP_V2_FACTORY", ctor.v2Factory],
  ["contracts/modules/uniswap/UniswapImmutables.sol", "UniswapImmutables", "UNISWAP_V3_FACTORY", ctor.v3Factory],
  ["contracts/modules/uniswap/UniswapImmutables.sol", "UniswapImmutables", "UNISWAP_V2_PAIR_INIT_CODE_HASH", ctor.pairInitCodeHash],
  ["contracts/modules/uniswap/UniswapImmutables.sol", "UniswapImmutables", "UNISWAP_V3_POOL_INIT_CODE_HASH", ctor.poolInitCodeHash],
  ["contracts/modules/MigratorImmutables.sol", "MigratorImmutables", "V3_POSITION_MANAGER", ctor.v3NFTPositionManager],
  ["contracts/modules/MigratorImmutables.sol", "MigratorImmutables", "V4_POSITION_MANAGER", ctor.v4PositionManager],
  ["contracts/modules/ChainedActions.sol", "ChainedActions", "SPOKE_POOL", ctor.spokePool],
  ["lib/v4-periphery/src/base/ImmutableState.sol", "ImmutableState", "poolManager", ctor.v4PoolManager],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_cachedChainId", "0x89"],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_cachedThis", router],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_cachedDomainSeparator", "0x5f417c77a3dadfac0a46fef6f8c2757614faa19a2440425efb0a5c07e754a3db"],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_hashedName", "0xa11b775f1048ec545859d88137f90763cf7eee88ee2eace12b317c4eb4f76c80"],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_hashedVersion", "0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5"],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_name", "0x556e6976657273616c526f75746572000000000000000000000000000000000f"],
  ["lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol", "EIP712", "_version", "0x3200000000000000000000000000000000000000000000000000000000000001"],
];
function fixture() {
  const settings = { viaIR: true, metadata: { appendCBOR: true, bytecodeHash: "none", useLiteralContent: false }, libraries: {}, optimizer: { runs: 3000, enabled: true }, evmVersion: "cancun", remappings: [] };
  const sourcePaths = ["contracts/UniversalRouter.sol", "contracts/base/Dispatcher.sol", "lib/v4-periphery/src/interfaces/IV4Router.sol", ...new Set(bindings.map(x => x[0]))];
  const sources = Object.fromEntries(sourcePaths.map(path => [path, { content: "hello" }]));
  const metadata = { compiler: { version: "0.8.26+commit.8a97fa7a" }, settings: { ...settings, compilationTarget: { "contracts/UniversalRouter.sol": "UniversalRouter" } }, sources: Object.fromEntries(sourcePaths.map(path => [path, { keccak256: keccak256(stringToHex("hello")) }])) };
  const compiled = "60" + "00".repeat(17 * 32) + "ff";
  const deployed = "0x60" + bindings.map(x => x[3].slice(2).toLowerCase().padStart(64, "0")).join("") + "ff";
  const outputSources = {};
  const refs = {};
  bindings.forEach(([path, scope, name], i) => {
    refs[i + 1] = [{ start: 1 + i * 32, length: 32 }];
    outputSources[path] ??= { ast: { nodes: [{ nodeType: "ContractDefinition", name: scope, nodes: [] }] } };
    outputSources[path].ast.nodes[0].nodes.push({ nodeType: "VariableDeclaration", stateVariable: true, mutability: "immutable", name, id: i + 1 });
  });
  sourcePaths.forEach(path => { outputSources[path] ??= { ast: { nodes: [] } }; });
  const args = encodeAbiParameters(ctorAbi, [ctor]);
  const evidence = { rpcSnapshot: { chainId: 137, address: router, blockNumber: "0x1", timestamp: "0x1", bytecode: deployed }, sourcify: { chainId: "137", address: router, runtimeMatch: "match", sources, metadata, compilation: { compilerVersion: "0.8.26+commit.8a97fa7a", compilerSettings: settings }, stdJsonInput: { language: "Solidity", settings, sources }, runtimeBytecode: { onchainBytecode: deployed }, creationBytecode: { onchainBytecode: "0x6000" + args.slice(2), transformationValues: { constructorArguments: args } } } };
  const output = { sources: outputSources, contracts: { "contracts/UniversalRouter.sol": { UniversalRouter: { metadata: JSON.stringify(metadata), evm: { bytecode: { object: "6000", linkReferences: {} }, deployedBytecode: { object: compiled, immutableReferences: refs, linkReferences: {} } } } } } };
  return { evidence, output };
}
const version = "0.8.26+commit.8a97fa7a.Emscripten.clang";
const verify = f => verifyRouterRebuild(f.evidence, f.output, version, pins);

test("prepares literal sources with pinned compiler settings and AST output", () => {
  const f = fixture();
  const input = prepareRouterInput(f.evidence, pins);
  assert.equal(input.settings.optimizer.runs, 3000);
  assert.deepEqual(input.settings.outputSelection["*"][""], ["ast"]);
  assert.equal(input.sources["contracts/UniversalRouter.sol"].content, "hello");
  input.sources["contracts/UniversalRouter.sol"].content = "mutated";
  assert.equal(f.evidence.sourcify.sources["contracts/UniversalRouter.sol"].content, "hello");
});
test("rejects inconsistent sources, settings and compiler identity", () => {
  for (const mutate of [f => f.evidence.sourcify.sources["contracts/UniversalRouter.sol"].content = "evil", f => delete f.evidence.sourcify.stdJsonInput.sources["contracts/UniversalRouter.sol"], f => f.evidence.sourcify.stdJsonInput.settings.optimizer.runs = 4444, f => f.evidence.sourcify.metadata.compiler.version = "0.8.27+commit.abcdef12", f => f.evidence.sourcify.stdJsonInput.sources["contracts/UniversalRouter.sol"].urls = ["https://example.com"]]) {
    const f = fixture(); mutate(f); assert.throws(() => prepareRouterInput(f.evidence, pins));
  }
});
test("derives all immutable values from compiled AST and constructor without trusting Sourcify replacement values", () => {
  const result = verify(fixture());
  assert.equal(result.independentRuntimeMatch, true);
  assert.equal(result.independentCreationMatch, true);
  assert.equal(result.immutableVariableCount, 17);
  assert.equal(result.immutableReferenceCount, 17);
  assert.equal(result.constructor.permit2.toLowerCase(), ctor.permit2);
  assert.equal(result.deployedSourceVerified, false);
  assert.equal(result.calldataValidated, false);
});
test("rejects wrong compiler, error output and missing contract", () => {
  const f = fixture();
  assert.throws(() => verifyRouterRebuild(f.evidence, f.output, "0.8.25+commit.abcdef12.Emscripten.clang", pins));
  f.output.errors = [{ severity: "error", message: "SECRET" }]; assert.throws(() => verify(f));
  delete f.output.errors; delete f.output.contracts; assert.throws(() => verify(f));
});
test("rejects one changed runtime byte outside immutable ranges", () => {
  const f = fixture();
  f.output.contracts["contracts/UniversalRouter.sol"].UniversalRouter.evm.deployedBytecode.object = "61" + "00".repeat(17 * 32) + "ff";
  assert.throws(() => verify(f));
});
test("rejects changed constructor or trailing constructor bytes", () => {
  for (const args of [encodeAbiParameters(ctorAbi, [{ ...ctor, weth9: router }]), encodeAbiParameters(ctorAbi, [ctor]) + "00".repeat(32)]) {
    const f = fixture(); f.evidence.sourcify.creationBytecode.transformationValues.constructorArguments = args; assert.throws(() => verify(f));
  }
});
test("rejects unknown immutable names, wrong source scope and duplicate AST IDs", () => {
  for (const mutate of [f => f.output.sources[bindings[0][0]].ast.nodes[0].nodes[0].name = "ATTACKER", f => f.output.sources[bindings[0][0]].ast.nodes[0].name = "WrongScope", f => f.output.sources[bindings[0][0]].ast.nodes[0].nodes[1].id = 1]) {
    const f = fixture(); mutate(f); assert.throws(() => verify(f));
  }
});
test("rejects missing, overlapping, out-of-range and non-word immutable references", () => {
  for (const mutate of [r => delete r[1], r => r[2][0].start = 1, r => r[1][0].start = 10000, r => r[1][0].length = 31, r => r[1].push({ start: 1, length: 32 }), r => r[999] = [{ start: 0, length: 32 }]]) {
    const f = fixture(); mutate(f.output.contracts["contracts/UniversalRouter.sol"].UniversalRouter.evm.deployedBytecode.immutableReferences); assert.throws(() => verify(f));
  }
});
test("rejects nonzero compiler placeholders, linked libraries and changed creation bytes", () => {
  for (const mutate of [b => b.deployedBytecode.object = "60ff" + "00".repeat(17 * 32 - 1) + "ff", b => b.deployedBytecode.linkReferences = { x: {} }, b => b.bytecode.object = "6001"]) {
    const f = fixture(); mutate(f.output.contracts["contracts/UniversalRouter.sol"].UniversalRouter.evm); assert.throws(() => verify(f));
  }
});
test("checks every repeated immutable occurrence rather than just the first", () => {
  const f = fixture();
  const runtime = f.output.contracts["contracts/UniversalRouter.sol"].UniversalRouter.evm.deployedBytecode;
  runtime.immutableReferences[1].push({ start: 546, length: 32 });
  runtime.object += "00".repeat(32);
  f.evidence.rpcSnapshot.bytecode += ctor.permit2.slice(2).padStart(64, "0");
  f.evidence.sourcify.runtimeBytecode.onchainBytecode = f.evidence.rpcSnapshot.bytecode;
  assert.equal(verify(f).immutableReferenceCount, 18);
  f.evidence.rpcSnapshot.bytecode = f.evidence.rpcSnapshot.bytecode.slice(0, -2) + "00";
  f.evidence.sourcify.runtimeBytecode.onchainBytecode = f.evidence.rpcSnapshot.bytecode;
  assert.throws(() => verify(f));
});
test("rejects a compiled metadata graph that omits or changes source content hashes", () => {
  const f = fixture();
  const contract = f.output.contracts["contracts/UniversalRouter.sol"].UniversalRouter;
  const meta = JSON.parse(contract.metadata);
  meta.sources["contracts/UniversalRouter.sol"].keccak256 = "0x" + "00".repeat(32);
  contract.metadata = JSON.stringify(meta);
  assert.throws(() => verify(f));
});
test("CLI rejects options before touching evidence and never prints arbitrary arguments or credentials", () => {
  const run = spawnSync(process.execPath, [new URL("./rebuild-router-deployment.mjs", import.meta.url).pathname, "--evil=SECRET"], { encoding: "utf8", env: { ...process.env, UNISWAP_API_KEY: "SECRET" } });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '{"status":"unavailable","code":"INVALID_OPTION"}\n');
  assert.equal(run.stderr, "");
});
