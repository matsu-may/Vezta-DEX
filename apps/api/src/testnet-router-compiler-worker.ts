import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { TESTNET_ROUTER_COMPILER_VERSION } from "./testnet-router-rebuild";

// Offline subprocess of testnet-router-rebuild-cli. Compiler installation is trusted local tooling.
try {
  if (process.argv.length !== 2) throw new Error("Invalid worker option");
  const input = readFileSync(0, "utf8"); if (Buffer.byteLength(input) > 5000000) throw new Error("Oversized input");
  const require = createRequire(import.meta.url);
  const solc = require(fileURLToPath(new URL("../../../.local-evidence/compiler-tools/solc-0.7.6/node_modules/solc/index.js", import.meta.url)));
  const version = solc.version(); if (version !== TESTNET_ROUTER_COMPILER_VERSION) throw new Error("Invalid compiler version");
  const output = solc.compile(input); // No filesystem/network import callback.
  if (typeof output !== "string" || Buffer.byteLength(output) > 12000000) throw new Error("Oversized output");
  process.stdout.write(JSON.stringify({ compilerVersion: version, output }));
} catch { process.stdout.write('{"unavailable":true}'); process.exitCode = 1; }
