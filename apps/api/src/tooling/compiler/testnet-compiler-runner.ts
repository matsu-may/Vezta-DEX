import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestnetRouterCompiler, TESTNET_ROUTER_COMPILER_SHA256, TestnetRebuildError } from "./testnet-router-rebuild";

export type CompilerSpawn = (command: string, args: string[], options: {
  input: string; timeout: number; maxBuffer: number; encoding: "utf8"; cwd: URL;
}) => {
  status: number | null; stdout: string; error?: Error;
};
const localSpawn: CompilerSpawn = (command, args, options) => spawnSync(command, args, options);

/** Caller verifies binary fingerprint before this bounded subprocess. No compiler/network imports here. */
export function runTestnetCompiler(input: string, spawn: CompilerSpawn = localSpawn): { compilerVersion: string; output: string } {
  if (Buffer.byteLength(input) > 5000000) throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE");
  let child: ReturnType<CompilerSpawn>;
  try {
    child = spawn(process.execPath, ["--max-old-space-size=512", "--import", "tsx",
      fileURLToPath(new URL("./testnet-router-compiler-worker.ts", import.meta.url))],
    { input, encoding: "utf8", timeout: 60000, maxBuffer: 16000000, cwd: new URL("../../../", import.meta.url) });
  } catch { throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE"); }
  if (child.error || child.status !== 0) throw new TestnetRebuildError("REBUILD_COMPILE_UNAVAILABLE");
  let output: string; let compilerVersion: unknown;
  try {
    if (Buffer.byteLength(child.stdout) > 16000000) throw new Error("Oversized protocol");
    const decoded = JSON.parse(child.stdout);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || typeof decoded.output !== "string"
      || Buffer.byteLength(decoded.output) > 12000000) throw new Error("Invalid compiler output");
    output = decoded.output; compilerVersion = decoded.compilerVersion;
  } catch { throw new TestnetRebuildError("REBUILD_OUTPUT_INVALID"); }
  assertTestnetRouterCompiler(compilerVersion, TESTNET_ROUTER_COMPILER_SHA256);
  return { compilerVersion: compilerVersion as string, output };
}
