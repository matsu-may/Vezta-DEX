import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prepareRouterInput, verifyRouterRebuild, COMPILER_VERSION } from "./router-rebuild.mjs";

// Offline verification only. Never load .env, request transactions or execute source imports.
const workspace = new URL("../.superpowers/sdd/2026-09-28-eoa-swap-preparation/", import.meta.url);
const at = name => new URL(name, workspace);
const sha = content => createHash("sha256").update(content).digest("hex");
const codes = ["INVALID_OPTION", "EVIDENCE_NOT_FOUND", "COMPILER_NOT_INSTALLED", "INVALID_COMPILER_VERSION", "INVALID_REBUILD_EVIDENCE", "OVERSIZED_ARTIFACT", "COMPILER_OUTPUT_TOO_LARGE"];
function boundedRead(path, limit = 8_000_000) {
  if (statSync(path).size > limit) throw new Error("OVERSIZED_ARTIFACT");
  return readFileSync(path, "utf8");
}
try {
  const [mode, ...extra] = process.argv.slice(2);
  if (!["--prepare", "--compile"].includes(mode) || extra.length > 0) throw new Error("INVALID_OPTION");
  // Remove a previous success before any new compile attempt, including a failed evidence read.
  if (mode === "--compile") rmSync(at("router-rebuild-report.json"), { force: true });
  if (!existsSync(at("router-deployment-public.json"))) throw new Error("EVIDENCE_NOT_FOUND");
  const evidenceBytes = boundedRead(at("router-deployment-public.json"));
  const evidence = JSON.parse(evidenceBytes);
  const input = prepareRouterInput(evidence);
  const inputBytes = JSON.stringify(input);
  mkdirSync(workspace, { recursive: true });
  writeFileSync(at("router-compiler-input.json"), inputBytes + "\n");
  if (mode === "--prepare") {
    process.stdout.write(JSON.stringify({ status: "input-prepared", compilerVersion: COMPILER_VERSION, sourceCount: Object.keys(input.sources).length, evidenceSha256: sha(evidenceBytes), inputSha256: sha(inputBytes) }) + "\n");
  } else {
    const compilerEntry = at("compiler-tools/node_modules/solc/index.js");
    if (!existsSync(compilerEntry)) throw new Error("COMPILER_NOT_INSTALLED");
    const require = createRequire(at("compiler-tools/package.json"));
    const solc = require(fileURLToPath(compilerEntry));
    const compilerVersion = solc.version();
    if (compilerVersion !== `${COMPILER_VERSION}.Emscripten.clang`) throw new Error("INVALID_COMPILER_VERSION");
    const compilerSha256 = sha(boundedRead(at("compiler-tools/node_modules/solc/soljson.js"), 32_000_000));
    const outputBytes = solc.compile(inputBytes); // Literal sources only; no import callback supplied.
    if (typeof outputBytes !== "string" || Buffer.byteLength(outputBytes) > 32_000_000) throw new Error("COMPILER_OUTPUT_TOO_LARGE");
    writeFileSync(at("router-compiler-output.json"), outputBytes + "\n");
    const summary = verifyRouterRebuild(evidence, JSON.parse(outputBytes), compilerVersion);
    const report = { status: "rebuild-verified", verifiedAt: new Date().toISOString(), evidenceSha256: sha(evidenceBytes), inputSha256: sha(inputBytes), outputSha256: sha(outputBytes), compilerSha256, ...summary };
    writeFileSync(at("router-rebuild-report.json"), JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify(report) + "\n");
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "unavailable", code: codes.includes(error?.message) ? error.message : "INVALID_REBUILD_EVIDENCE" }) + "\n");
  process.exitCode = 1;
}
