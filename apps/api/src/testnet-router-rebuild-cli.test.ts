import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { routerRebuildFixture } from "./testnet-router-rebuild.test-helper";
const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
function cli(snapshotPresent = true, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "dex-router-rebuild-cli-")); owned.push(root);
  const api = join(root, "apps/api"); const src = join(api, "src"); mkdirSync(src, { recursive: true });
  for (const name of ["testnet-router-rebuild-cli.ts", "testnet-router-rebuild.ts", "testnet-source-evidence.ts", "testnet-source-file.ts", "testnet-artifacts.ts"])
    copyFileSync(new URL(name, import.meta.url), join(src, name));
  writeFileSync(join(api, "package.json"), '{"type":"module"}'); symlinkSync(new URL("../node_modules", import.meta.url), join(api, "node_modules"));
  const evidence = join(root, ".local-evidence"); mkdirSync(evidence);
  const fixture = routerRebuildFixture(); const bytes = JSON.stringify({ version: 1, role: "router", payload: fixture.value });
  writeFileSync(join(evidence, "base-sepolia-source-router.json"), bytes);
  if (snapshotPresent) writeFileSync(join(evidence, "base-sepolia-deployment.json"), JSON.stringify(fixture.snapshot));
  const guard = join(root, "guard.mjs"); writeFileSync(guard, 'globalThis.fetch = async () => { throw new Error("Network forbidden"); };');
  return { ...spawnSync(process.execPath, ["--import", "tsx", "--import", guard, "src/testnet-router-rebuild-cli.ts", ...args],
    { cwd: api, encoding: "utf8", timeout: 10000 }), evidence, bytes };
}

it("reports a missing isolated compiler without fetching or changing validated source/snapshot evidence", () => {
  const result = cli();
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-router-rebuild-unavailable", code: "REBUILD_COMPILE_UNAVAILABLE" });
  expect(readFileSync(join(result.evidence, "base-sepolia-source-router.json"), "utf8")).toBe(result.bytes);
  expect(readdirSync(result.evidence).sort()).toEqual(["base-sepolia-deployment.json", "base-sepolia-source-router.json"]);
}, 15000);

it("fails before loading any compiler when the historical snapshot is missing", () => {
  const result = cli(false);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "REBUILD_SNAPSHOT_REQUIRED" });
}, 15000);

it("rejects unsupported CLI arguments before local or external acquisition", () => {
  const result = cli(false, ["--save"]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "REBUILD_INVALID_OPTION" });
}, 15000);
