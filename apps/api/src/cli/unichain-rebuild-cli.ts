import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { prepareUnichainDeployment, verifyUnichainDeployment } from "../infrastructure/deployments/unichain-deployment";
import { runTestnetCompiler } from "../tooling/compiler/testnet-compiler-runner";
import { assertTestnetRouterCompiler, TESTNET_ROUTER_COMPILER_VERSION, type TestnetSwapDependencyRole } from "../tooling/compiler/testnet-router-rebuild";

// Offline proof only; filenames are fixed, source paths never become filesystem paths.
const directory = new URL("../../../../.local-evidence/unichain-qualification/", import.meta.url);
function bytes(path: URL, maximum: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum) throw new Error("Invalid evidence size");
    const data = Buffer.alloc(maximum + 1); let size = 0;
    while (size < data.length) {
      const n = readSync(fd, data, size, data.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > maximum) throw new Error("Invalid evidence size");
    return data.subarray(0, size);
  } finally { closeSync(fd); }
}
const roles: readonly TestnetSwapDependencyRole[] = ["router", "quoter", "factory", "pool", "manager"];
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--role" || !roles.includes(args[1] as TestnetSwapDependencyRole)) throw new Error("Invalid role");
  const role = args[1] as TestnetSwapDependencyRole;
  const rawBytes = bytes(new URL(`unichain-${role}.${role === "factory" ? "raw" : "blockscout"}.json`, directory), 8000000);
  const snapshot = JSON.parse(bytes(new URL("unichain-snapshot.json", directory), 1000000).toString("utf8"));
  if (snapshot.chainId !== 1301 || !Array.isArray(snapshot.codes) || snapshot.codes.length !== 5) throw new Error("Invalid snapshot");
  const row = snapshot.codes.find((r: {role: unknown}) => r.role === role);
  const prepared = prepareUnichainDeployment(role, JSON.parse(rawBytes.toString("utf8")), {
    chainId: snapshot.chainId, blockNumber: snapshot.number, blockHash: snapshot.hash, address: row?.address, code: row?.code,
  });
  const compiler = bytes(new URL("../../../../.local-evidence/compiler-tools/solc-0.7.6/node_modules/solc/soljson.js", import.meta.url), 32000000);
  const compilerSha256 = sha(compiler);
  assertTestnetRouterCompiler(TESTNET_ROUTER_COMPILER_VERSION, compilerSha256);
  const compiled = runTestnetCompiler(JSON.stringify(prepared.input));
  const proof = verifyUnichainDeployment(prepared, JSON.parse(compiled.output), compiled.compilerVersion, compilerSha256);
  process.stdout.write(JSON.stringify({...proof, compilerSha256, rawSha256:sha(rawBytes), outputSha256:sha(compiled.output), verifiedAt:new Date().toISOString()}) + "\n");
} catch {
  process.stdout.write(JSON.stringify({status:"unichain-rebuild-unavailable",code:"UNICHAIN_DEPLOYMENT_INVALID",executionEnabled:false}) + "\n");
  process.exitCode = 1;
}
