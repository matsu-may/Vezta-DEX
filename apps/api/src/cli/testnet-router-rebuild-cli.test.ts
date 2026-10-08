import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { routerRebuildFixture, quoterRebuildFixture, factoryRebuildFixture, poolManagerRebuildFixture } from "../tooling/compiler/testnet-router-rebuild.test-helper";
const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
function cli(snapshotPresent = true, args: string[] = [], role: "router" | "quoter" | "factory" | "pool" | "manager" = "router") {
  const root = mkdtempSync(join(tmpdir(), "dex-router-rebuild-cli-")); owned.push(root);
  const api = join(root, "apps/api"); const src = join(api, "src"); mkdirSync(src, { recursive: true });
  for (const name of ["src/cli/testnet-router-rebuild-cli.ts", "src/tooling/compiler/testnet-router-rebuild.ts",
    "src/tooling/compiler/testnet-compiler-runner.ts", "src/tooling/evidence/testnet-source-evidence.ts",
    "src/tooling/evidence/testnet-source-file.ts", "src/infrastructure/deployments/testnet-artifacts.ts"]) {
    mkdirSync(dirname(join(api, name)), { recursive: true });
    copyFileSync(new URL(name, new URL("../../", import.meta.url)), join(api, name));
  }
  writeFileSync(join(api, "package.json"), '{"type":"module"}'); symlinkSync(new URL("../../node_modules", import.meta.url), join(api, "node_modules"));
  const evidence = join(root, ".local-evidence"); mkdirSync(evidence);
  const fixture = role === "router" ? routerRebuildFixture() : role === "quoter" ? quoterRebuildFixture()
    : role === "factory" ? factoryRebuildFixture() : poolManagerRebuildFixture(role);
  const bytes = JSON.stringify({ version: 1, role, payload: fixture.value });
  writeFileSync(join(evidence, `base-sepolia-source-${role}.json`), bytes);
  if (snapshotPresent) writeFileSync(join(evidence, "base-sepolia-deployment.json"), JSON.stringify(fixture.snapshot));
  const guard = join(root, "guard.mjs"); writeFileSync(guard, 'globalThis.fetch = async () => { throw new Error("Network forbidden"); };');
  return { ...spawnSync(process.execPath, ["--import", "tsx", "--import", guard, "src/cli/testnet-router-rebuild-cli.ts", ...args],
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

it("selects the quoter cache and policy without falling back to router evidence or network", () => {
  const result = cli(true, ["--role", "quoter"], "quoter");
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-quoter-rebuild-unavailable", code: "REBUILD_COMPILE_UNAVAILABLE" });
  expect(readFileSync(join(result.evidence, "base-sepolia-source-quoter.json"), "utf8")).toBe(result.bytes);
  expect(readdirSync(result.evidence).sort()).toEqual(["base-sepolia-deployment.json", "base-sepolia-source-quoter.json"]);
}, 15000);

it.each([["--role", "unknown"], ["--role"], ["--role", "router", "--role", "quoter"]])("rejects unsupported or duplicate rebuild roles: %j", (...args) => {
  const result = cli(false, args);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "REBUILD_INVALID_OPTION" });
}, 15000);

it.each(["pool", "manager"] as const)("selects only the %s cache before checking the isolated compiler", role => {
  const result = cli(true, ["--role", role], role);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: `testnet-${role}-rebuild-unavailable`, code: "REBUILD_COMPILE_UNAVAILABLE" });
  expect(readFileSync(join(result.evidence, `base-sepolia-source-${role}.json`), "utf8")).toBe(result.bytes);
  expect(readdirSync(result.evidence).sort()).toEqual(["base-sepolia-deployment.json", `base-sepolia-source-${role}.json`]);
}, 15000);

it("selects only the factory cache and settings before checking the isolated compiler", () => {
  const result = cli(true, ["--role", "factory"], "factory");
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-factory-rebuild-unavailable", code: "REBUILD_COMPILE_UNAVAILABLE" });
  expect(readFileSync(join(result.evidence, "base-sepolia-source-factory.json"), "utf8")).toBe(result.bytes);
  expect(readdirSync(result.evidence).sort()).toEqual(["base-sepolia-deployment.json", "base-sepolia-source-factory.json"]);
}, 15000);
