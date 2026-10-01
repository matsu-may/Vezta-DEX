import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPinnedTestnetArtifacts, TestnetArtifactError } from "./testnet-artifacts";
import { TestnetSourceEvidenceFile } from "./testnet-source-file";
import { TestnetSourceError } from "./testnet-source-evidence";
import { assertTestnetRouterCompiler, prepareTestnetRouterRebuild, verifyTestnetRouterRebuild,
  TESTNET_ROUTER_COMPILER_VERSION, TestnetRebuildError } from "./testnet-router-rebuild";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
try {
  if (process.argv.length !== 2) throw new TestnetRebuildError("REBUILD_INVALID_OPTION");
  const file = new TestnetSourceEvidenceFile(new URL("../../../.local-evidence/", import.meta.url), "router");
  const source = file.read(); const snapshot = file.readSnapshot(); const bundle = loadPinnedTestnetArtifacts();
  const prepared = prepareTestnetRouterRebuild(source, snapshot, bundle);
  let compilerHash: string;
  try {
    const path = new URL("../../../.local-evidence/compiler-tools/solc-0.7.6/node_modules/solc/soljson.js", import.meta.url);
    if (statSync(path).size > 32000000) throw new Error("Oversized compiler");
    const bytes = readFileSync(path); if (bytes.length > 32000000) throw new Error("Oversized compiler");
    compilerHash = sha(bytes);
  } catch { throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE"); }
  assertTestnetRouterCompiler(TESTNET_ROUTER_COMPILER_VERSION, compilerHash);
  const input = JSON.stringify(prepared.input);
  // Terminate hung compilers; never import solc in a web/API request or use an import callback.
  const child = spawnSync(process.execPath, ["--max-old-space-size=512", "--import", "tsx",
    fileURLToPath(new URL("testnet-router-compiler-worker.ts", import.meta.url))],
  { input, encoding: "utf8", timeout: 60000, maxBuffer: 16000000, cwd: new URL("../", import.meta.url) });
  if (child.error || child.status !== 0) throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE");
  let compiled: { compilerVersion: unknown; output: string };
  try {
    compiled = JSON.parse(child.stdout);
    if (typeof compiled.output !== "string" || Buffer.byteLength(compiled.output) > 12000000) throw new Error("Invalid compiler output");
  } catch { throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); }
  assertTestnetRouterCompiler(compiled.compilerVersion, compilerHash);
  let output: unknown;
  try { output = JSON.parse(compiled.output); } catch { throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); }
  const summary = verifyTestnetRouterRebuild(source, snapshot, output, compiled.compilerVersion, bundle);
  process.stdout.write(`${JSON.stringify({ ...summary, compilerSha256: compilerHash, outputSha256: sha(compiled.output),
    verifiedAt: new Date().toISOString() })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: "testnet-router-rebuild-unavailable",
    code: error instanceof TestnetRebuildError || error instanceof TestnetSourceError || error instanceof TestnetArtifactError
      ? error.code : "REBUILD_OUTPUT_INVALID" })}\n`);
  process.exitCode = 1;
}
