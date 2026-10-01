import { keccak256, stringToHex } from "viem";
import { loadPinnedTestnetArtifacts } from "./testnet-artifacts";

// Complete selected-field Sourcify v2 fixture; never live/provenance evidence.
export const sourceBundle = loadPinnedTestnetArtifacts();
export function sourceFixture() {
  const content = "pragma solidity =0.7.6; contract SwapRouter02 {}";
  return { chainId: "84532", address: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", match: "exact_match",
    creationMatch: "exact_match", runtimeMatch: "exact_match", verifiedAt: "2026-10-01T10:00:00.000Z",
    compilation: { language: "Solidity", compiler: "solc", compilerVersion: "0.7.6+commit.7338295f",
      name: "SwapRouter02", fullyQualifiedName: "contracts/SwapRouter02.sol:SwapRouter02" },
    metadata: { compiler: { version: "0.7.6+commit.7338295f" }, language: "Solidity",
      settings: { compilationTarget: { "contracts/SwapRouter02.sol": "SwapRouter02" } },
      sources: { "contracts/SwapRouter02.sol": { keccak256: keccak256(stringToHex(content)), license: "GPL-2.0-or-later" } } },
    stdJsonInput: { language: "Solidity", sources: { "contracts/SwapRouter02.sol": { content } },
      settings: { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul",
        metadata: { bytecodeHash: "ipfs" }, remappings: ["@x/=vendor/x/"], libraries: {},
        outputSelection: { "*": { "*": ["abi"] } } } },
    runtimeBytecode: { onchainBytecode: "0x6001" } };
}
export function sourceSupersetFixture() {
  const fixture = sourceFixture();
  return { ...fixture, stdJsonInput: { ...fixture.stdJsonInput, sources: {
    ...fixture.stdJsonInput.sources,
    ...Object.fromEntries(Array.from({ length: 235 }, (_, i) => [`unused/file${i}.sol`, { content: "// unused fixture" }])),
  } } };
}
export function snapshotFixture() {
  return { version: 1, chainId: 84532, blockNumber: "123", blockHash: `0x${"ab".repeat(32)}`,
    timestamp: "1790848800", observedAt: "2026-10-01T10:00:00.000Z", recordedAt: "2026-10-01T10:00:02.000Z",
    source: "base-sepolia-rpc", contracts: sourceBundle.map(a => ({ role: a.role, address: a.address,
      packageName: a.packageName, version: a.version, artifactSha256: a.sha256,
      artifactRuntimeHash: keccak256(a.runtimeBytecode), runtimeBytecode: "0x6001",
      runtimeHash: keccak256("0x6001"), artifactRuntimeExactMatch: false })) };
}
