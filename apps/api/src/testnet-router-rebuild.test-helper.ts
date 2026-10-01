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
