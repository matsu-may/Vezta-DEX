import { keccak256, stringToHex } from "viem";
import { sourceFixture, snapshotFixture } from "./testnet-source.test-helper";

// Hand-constructed compiler boundary fixture, never deployment evidence.
export function routerRebuildFixture() {
  const source = sourceFixture();
  source.stdJsonInput.settings.metadata.bytecodeHash = "none";
  source.stdJsonInput.settings.remappings = [];
  const periphery = "@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol";
  const immutable = "contracts/base/ImmutableState.sol";
  const sources: Record<string, { content: string }> = {
    ...source.stdJsonInput.sources, [periphery]: { content: "// fixture periphery" }, [immutable]: { content: "// fixture immutable" },
  };
  const hashes = Object.fromEntries(Object.entries(sources).map(([path, s]) => [path, { keccak256: keccak256(stringToHex(s.content)) }]));
  const words = ["4752ba5dbc23f44d87826276bf6fd6b1c372ad24", "4200000000000000000000000000000000000006",
    "0000000000000000000000000000000000000000", "27f971cb582bf9e50f397e4d29a5c7a34f11faa2"];
  const runtime = `0x60${words.map(x => x.padStart(64, "0")).join("")}01`;
  const value = { ...source, stdJsonInput: { ...source.stdJsonInput, sources },
    metadata: { ...source.metadata, sources: hashes }, runtimeBytecode: { onchainBytecode: runtime } };
  const snapshot = snapshotFixture();
  const row = snapshot.contracts.find(x => x.role === "router")!;
  row.runtimeBytecode = runtime; row.runtimeHash = keccak256(runtime as `0x${string}`);
  const variable = (id: number, name: string) => ({ id, name, nodeType: "VariableDeclaration", stateVariable: true,
    mutability: "immutable", typeDescriptions: { typeString: "address" } });
  const ast = (name: string, nodes: unknown[]) => ({ ast: { nodes: [{ name, nodeType: "ContractDefinition", nodes }] } });
  const metadata = { compiler: { version: "0.7.6+commit.7338295f" }, sources: structuredClone(hashes),
    settings: { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul", metadata: { bytecodeHash: "none" },
      libraries: {}, remappings: [], compilationTarget: { "contracts/SwapRouter02.sol": "SwapRouter02" } } };
  const contract = { metadata: JSON.stringify(metadata), evm: {
    bytecode: { object: "6001", linkReferences: {} },
    deployedBytecode: { object: `60${"00".repeat(128)}01`, linkReferences: {}, immutableReferences: {
      "1": [{ start: 1, length: 32 }], "2": [{ start: 33, length: 32 }],
      "3": [{ start: 65, length: 32 }], "4": [{ start: 97, length: 32 }],
    } },
  } };
  const output = { errors: [{ severity: "warning", errorCode: "1878" }],
    contracts: { "contracts/SwapRouter02.sol": { SwapRouter02: contract } },
    sources: { "contracts/SwapRouter02.sol": ast("SwapRouter02", []),
      [periphery]: ast("PeripheryImmutableState", [variable(1, "factory"), variable(2, "WETH9")]),
      [immutable]: ast("ImmutableState", [variable(3, "factoryV2"), variable(4, "positionManager")]) } };
  return { value, snapshot, output, contract, metadata };
}

export function quoterRebuildFixture() {
  const base = routerRebuildFixture();
  const path = "contracts/lens/QuoterV2.sol";
  const periphery = "@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol";
  const sources = { [path]: { content: "pragma solidity =0.7.6; contract QuoterV2 {}" }, [periphery]: { content: "// fixture periphery" } };
  const hashes = Object.fromEntries(Object.entries(sources).map(([file, s]) => [file, { keccak256: keccak256(stringToHex(s.content)) }]));
  const runtime = "0x60" + "0000000000000000000000004752ba5dbc23f44d87826276bf6fd6b1c372ad24"
    + "0000000000000000000000004200000000000000000000000000000000000006" + "01";
  const value = { ...base.value, address: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    metadata: { ...base.value.metadata, sources: hashes, settings: { compilationTarget: { [path]: "QuoterV2" } } },
    stdJsonInput: { ...base.value.stdJsonInput, sources }, runtimeBytecode: { onchainBytecode: runtime } };
  const snapshot = snapshotFixture(); const row = snapshot.contracts.find(x => x.role === "quoter")!;
  row.runtimeBytecode = runtime; row.runtimeHash = keccak256(runtime as `0x${string}`);
  const metadata = { ...base.metadata, sources: structuredClone(hashes),
    settings: { ...base.metadata.settings, compilationTarget: { [path]: "QuoterV2" } } };
  const contract = { metadata: JSON.stringify(metadata), evm: { bytecode: { object: "6001", linkReferences: {} },
    deployedBytecode: { object: `60${"00".repeat(64)}01`, linkReferences: {},
      immutableReferences: { "1": [{ start: 1, length: 32 }], "2": [{ start: 33, length: 32 }] } } } };
  const output = { contracts: { [path]: { QuoterV2: contract } }, sources: {
    [path]: { ast: { nodes: [{ name: "QuoterV2", nodeType: "ContractDefinition", nodes: [] }] } },
    [periphery]: base.output.sources[periphery],
  } };
  return { value, snapshot, output, contract, metadata };
}

export function factoryRebuildFixture() {
  const base = quoterRebuildFixture(); const path = "contracts/UniswapV3Factory.sol";
  const guard = "contracts/NoDelegateCall.sol";
  const sources = { [path]: { content: "pragma solidity =0.7.6; contract UniswapV3Factory {}" }, [guard]: { content: "// fixture no delegatecall" } };
  const hashes = Object.fromEntries(Object.entries(sources).map(([file, s]) => [file, { keccak256: keccak256(stringToHex(s.content)) }]));
  const settings = { ...base.value.stdJsonInput.settings, optimizer: { enabled: true, runs: 800 } };
  const runtime = "0x60" + "0000000000000000000000004752ba5dbc23f44d87826276bf6fd6b1c372ad24" + "01";
  const value = { ...base.value, address: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    metadata: { ...base.value.metadata, sources: hashes, settings: { compilationTarget: { [path]: "UniswapV3Factory" } } },
    stdJsonInput: { ...base.value.stdJsonInput, sources, settings }, runtimeBytecode: { onchainBytecode: runtime } };
  const snapshot = snapshotFixture(); const row = snapshot.contracts.find(x => x.role === "factory")!;
  row.runtimeBytecode = runtime; row.runtimeHash = keccak256(runtime as `0x${string}`);
  const metadata = { ...base.metadata, sources: structuredClone(hashes),
    settings: { ...base.metadata.settings, optimizer: { enabled: true, runs: 800 }, compilationTarget: { [path]: "UniswapV3Factory" } } };
  const contract = { metadata: JSON.stringify(metadata), evm: { bytecode: { object: "6002", linkReferences: {} },
    deployedBytecode: { object: `60${"00".repeat(32)}01`, linkReferences: {}, immutableReferences: { "5": [{ start: 1, length: 32 }] } } } };
  const output = { contracts: { [path]: { UniswapV3Factory: contract } },
    sources: { [path]: { ast: { nodes: [{ name: "UniswapV3Factory", nodeType: "ContractDefinition", nodes: [] }] } },
      [guard]: { ast: { nodes: [{ name: "NoDelegateCall", nodeType: "ContractDefinition", nodes: [{ id: 5, name: "original",
        nodeType: "VariableDeclaration", stateVariable: true, mutability: "immutable", typeDescriptions: { typeString: "address" } }] }] } } } };
  return { value, snapshot, output, contract, metadata };
}

// Synthetic compiler output with independently hand-checked immutable words; never live evidence.
export function poolManagerRebuildFixture(role: "pool" | "manager") {
  const base = factoryRebuildFixture();
  const path = role === "pool" ? "contracts/UniswapV3Pool.sol" : "contracts/NonfungiblePositionManager.sol";
  const name = role === "pool" ? "UniswapV3Pool" : "NonfungiblePositionManager";
  const address = role === "pool" ? "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad" : "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
  const bindings = role === "pool" ? [
    ["contracts/NoDelegateCall.sol", "NoDelegateCall", "original", "address", "46880b404cd35c165eddeff7421019f8dd25f4ad"],
    [path, name, "factory", "address", "4752ba5dbc23f44d87826276bf6fd6b1c372ad24"],
    [path, name, "token0", "address", "036cbd53842c5426634e7929541ec2318f3dcf7e"],
    [path, name, "token1", "address", "4200000000000000000000000000000000000006"],
    [path, name, "fee", "uint24", "bb8"], [path, name, "tickSpacing", "int24", "3c"],
    [path, name, "maxLiquidityPerTick", "uint128", "23746e6a58dcb13d4af821b93f062"],
  ] : [
    [path, name, "_tokenDescriptor", "address", "1e2a708040eb6ed08893e27e35d399e8e8e7857e"],
    ["contracts/base/ERC721Permit.sol", "ERC721Permit", "nameHash", "bytes32", "193ae757ecb6ead396a72d38c6cc38e1be93297aa66ffefea29e32ce3045475f"],
    ["contracts/base/ERC721Permit.sol", "ERC721Permit", "versionHash", "bytes32", "c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6"],
    ["contracts/base/PeripheryImmutableState.sol", "PeripheryImmutableState", "factory", "address", "4752ba5dbc23f44d87826276bf6fd6b1c372ad24"],
    ["contracts/base/PeripheryImmutableState.sol", "PeripheryImmutableState", "WETH9", "address", "4200000000000000000000000000000000000006"],
  ];
  const sources = Object.fromEntries(bindings.map(([file]) => [file, { content: `// fixture ${file}` }]));
  const hashes = Object.fromEntries(Object.entries(sources).map(([file, s]) => [file, { keccak256: keccak256(stringToHex(s.content)) }]));
  const settings = { ...base.value.stdJsonInput.settings, optimizer: { enabled: true, runs: role === "pool" ? 800 : 2000 } };
  const runtime = `0x60${bindings.map(b => b[4].padStart(64, "0")).join("")}01`;
  const value = { ...base.value, address, metadata: { ...base.value.metadata, sources: hashes, settings: { compilationTarget: { [path]: name } } },
    stdJsonInput: { ...base.value.stdJsonInput, sources, settings }, runtimeBytecode: { onchainBytecode: runtime } };
  const snapshot = snapshotFixture(); const row = snapshot.contracts.find(x => x.role === role)!;
  row.runtimeBytecode = runtime; row.runtimeHash = keccak256(runtime as `0x${string}`);
  const metadata = { ...base.metadata, sources: structuredClone(hashes), settings: { ...base.metadata.settings,
    optimizer: settings.optimizer, compilationTarget: { [path]: name } } };
  const immutableReferences = Object.fromEntries(bindings.map((_, i) => [String(i + 1), [{ start: 1 + i * 32, length: 32 }]]));
  const contract = { metadata: JSON.stringify(metadata), evm: { bytecode: { object: "6002", linkReferences: {} },
    deployedBytecode: { object: `60${"00".repeat(bindings.length * 32)}01`, linkReferences: {}, immutableReferences } } };
  const astSources: Record<string, { ast: { nodes: Array<{ name: string; nodeType: string; nodes: unknown[] }> } }> = {};
  bindings.forEach(([file, scope, variable, type], i) => {
    const source = astSources[file] ??= { ast: { nodes: [] } };
    let definition = source.ast.nodes.find(n => n.name === scope);
    if (!definition) { definition = { name: scope, nodeType: "ContractDefinition", nodes: [] }; source.ast.nodes.push(definition); }
    definition.nodes.push({ id: i + 1, name: variable, nodeType: "VariableDeclaration", stateVariable: true,
      mutability: "immutable", typeDescriptions: { typeString: type } });
  });
  return { value, snapshot, metadata, contract, bindings, output: { contracts: { [path]: { [name]: contract } }, sources: astSources } };
}
