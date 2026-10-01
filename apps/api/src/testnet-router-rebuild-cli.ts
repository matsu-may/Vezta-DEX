import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { loadPinnedTestnetArtifacts, TestnetArtifactError } from "./testnet-artifacts";
import { TestnetSourceEvidenceFile } from "./testnet-source-file";
import { TestnetSourceError } from "./testnet-source-evidence";
import { assertTestnetRouterCompiler, prepareTestnetSwapDependencyRebuild, verifyTestnetSwapDependencyRebuild,
  TESTNET_ROUTER_COMPILER_VERSION, TestnetRebuildError, type TestnetSwapDependencyRole } from "./testnet-router-rebuild";
import { runTestnetCompiler } from "./testnet-compiler-runner";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
let role: TestnetSwapDependencyRole = "router";
try {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--role" && (args[1] === "router" || args[1] === "quoter")) role = args[1];
  else if (args.length !== 0) throw new TestnetRebuildError("REBUILD_INVALID_OPTION");
  const file = new TestnetSourceEvidenceFile(new URL("../../../.local-evidence/", import.meta.url), role);
  const source = file.read(); const snapshot = file.readSnapshot(); const bundle = loadPinnedTestnetArtifacts();
  const prepared = prepareTestnetSwapDependencyRebuild(role, source, snapshot, bundle);
  let compilerHash: string;
  try {
    const path = new URL("../../../.local-evidence/compiler-tools/solc-0.7.6/node_modules/solc/soljson.js", import.meta.url);
    if (statSync(path).size > 32000000) throw new Error("Oversized compiler");
    const bytes = readFileSync(path); if (bytes.length > 32000000) throw new Error("Oversized compiler");
    compilerHash = sha(bytes);
  } catch { throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE"); }
  assertTestnetRouterCompiler(TESTNET_ROUTER_COMPILER_VERSION, compilerHash);
  const input = JSON.stringify(prepared.input);
  const compiled = runTestnetCompiler(input);
  assertTestnetRouterCompiler(compiled.compilerVersion, compilerHash);
  let output: unknown;
  try { output = JSON.parse(compiled.output); } catch { throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); }
  const summary = verifyTestnetSwapDependencyRebuild(role, source, snapshot, output, compiled.compilerVersion, bundle);
  process.stdout.write(`${JSON.stringify({ ...summary, compilerSha256: compilerHash, outputSha256: sha(compiled.output),
    verifiedAt: new Date().toISOString() })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: `testnet-${role}-rebuild-unavailable`,
    code: error instanceof TestnetRebuildError || error instanceof TestnetSourceError || error instanceof TestnetArtifactError
      ? error.code : "REBUILD_OUTPUT_INVALID" })}\n`);
  process.exitCode = 1;
}
