import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { Hex } from "viem";

// Public deployed bytecode only, captured at block 47551649 and independently rebuilt.
// Never imported by application code; fake RPC sources use it to exercise the real runtime guard.
const saved = JSON.parse(gunzipSync(readFileSync(new URL("fixtures/base-sepolia-runtime.json.gz", import.meta.url))).toString("utf8")) as {
  contracts: Array<{ role: string; address: string; code: Hex }>;
};
export const runtimeFixtureCodes = () => structuredClone(saved.contracts);
export const runtimeFixtureCode = (address: string) => saved.contracts.find(c => c.address.toLowerCase() === address.toLowerCase())?.code;
