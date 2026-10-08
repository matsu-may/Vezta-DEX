import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { TESTNET_DIRECT_POOLS, BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { loadPinnedTestnetArtifacts } from "../infrastructure/deployments/testnet-artifacts";
import { TestnetSourceEvidenceFile } from "../tooling/evidence/testnet-source-file";
import { assertTestnetRouterCompiler, prepareTestnetSwapDependencyRebuild, verifyTestnetPoolTemplate,
  TESTNET_ROUTER_COMPILER_VERSION } from "../tooling/compiler/testnet-router-rebuild";
import { runTestnetCompiler } from "../tooling/compiler/testnet-compiler-runner";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";

// Explicit local evidence command. It never updates application pins or sends a transaction.
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--save")) throw new Error("Invalid option");
  const directory = new URL("../../../../.local-evidence/", import.meta.url);
  const file = new TestnetSourceEvidenceFile(directory, "pool");
  const value = file.read(); const snapshot = file.readSnapshot(); const bundle = loadPinnedTestnetArtifacts();
  const prepared = prepareTestnetSwapDependencyRebuild("pool", value, snapshot, bundle);
  const compilerFile = new URL("compiler-tools/solc-0.7.6/node_modules/solc/soljson.js", directory);
  if (statSync(compilerFile).size > 32000000) throw new Error("Oversized compiler");
  const compilerSha256 = sha(readFileSync(compilerFile));
  assertTestnetRouterCompiler(TESTNET_ROUTER_COMPILER_VERSION, compilerSha256);
  const input = JSON.stringify(prepared.input); const compiled = runTestnetCompiler(input);
  const output: unknown = JSON.parse(compiled.output);
  const signal = AbortSignal.timeout(40000);
  const source = createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal);
  if (await source.getChainId() !== P.chainId) throw new Error("Wrong chain");
  const block = await source.getLatestBlock();
  const contracts = await Promise.all(TESTNET_DIRECT_POOLS.map(async selected => {
    const [code, factoryPool, state, spacing] = await Promise.all([
      source.getCode(selected.pool, block.number), source.getPool(selected.feeTier, block.number),
      source.getPoolState(selected.pool, block.number), source.getTickSpacing(selected.pool, block.number),
    ]);
    if (!same(factoryPool, selected.pool) || !same(state.factory, C.v3Factory)
      || !same(state.token0, C.USDC.address) || !same(state.token1, C.WETH.address)
      || state.fee !== selected.feeTier || spacing !== selected.tickSpacing) throw new Error("Wrong pool configuration");
    const proof = verifyTestnetPoolTemplate(value, snapshot, output, compiled.compilerVersion, bundle, selected.pool, code);
    return { address: selected.pool, feeTier: selected.feeTier, tickSpacing: spacing, code,
      runtimeHash: proof.runtimeHash, runtimeBytes: proof.runtimeBytes,
      immutableVariableCount: proof.immutableVariableCount, immutableReferenceCount: proof.immutableReferenceCount };
  }));
  if (!same(await source.getBlockHash(block.number), block.hash)
    || Math.abs(Date.now() - Number(block.timestamp) * 1000) >= 30000) throw new Error("Stale or changed block");
  const evidence = { version: 1, chainId: P.chainId, source: "base-sepolia-rpc", blockNumber: block.number.toString(),
    blockHash: block.hash, observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    compilerVersion: compiled.compilerVersion, compilerSha256, inputSha256: sha(input), outputSha256: sha(compiled.output),
    sourceInputSha256: prepared.summary.inputSha256, independentRuntimeMatch: true, contracts };
  if (args.length) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL("base-sepolia-direct-pools.json", directory), JSON.stringify(evidence) + "\n", { mode: 0o600 });
  }
  process.stdout.write(JSON.stringify({ ...evidence, status: "direct-pools-independently-rebuilt-read-only",
    contracts: contracts.map(row => ({ address: row.address, feeTier: row.feeTier, tickSpacing: row.tickSpacing, runtimeHash: row.runtimeHash, runtimeBytes: row.runtimeBytes, immutableVariableCount: row.immutableVariableCount, immutableReferenceCount: row.immutableReferenceCount })), evidenceSaved: !!args.length, executionEnabled: false }) + "\n");
}
void main().catch(() => { process.stdout.write('{"status":"direct-pools-evidence-unavailable","executionEnabled":false}\n'); process.exitCode = 1; });
