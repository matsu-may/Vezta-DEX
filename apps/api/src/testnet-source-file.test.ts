import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { TestnetSourceEvidenceFile } from "./testnet-source-file";
import { prepareTestnetSourceEvidence } from "./testnet-source-evidence";
import { sourceBundle, sourceFixture, snapshotFixture } from "./testnet-source.test-helper";
const owned: string[] = [];
function folder() { const path = mkdtempSync(join(tmpdir(), "dex-source-evidence-")); owned.push(path); return path; }
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });

function isolatedCli(payload: unknown) {
  const root = folder(); const api = join(root, "apps/api"); const src = join(api, "src"); mkdirSync(src, { recursive: true });
  for (const file of ["testnet-source-evidence-cli.ts", "testnet-source-evidence.ts", "testnet-source-fetch.ts", "testnet-source-file.ts", "testnet-artifacts.ts"])
    copyFileSync(new URL(file, import.meta.url), join(src, file));
  writeFileSync(join(api, "package.json"), '{"type":"module"}'); symlinkSync(new URL("../node_modules", import.meta.url), join(api, "node_modules"));
  const cache = join(root, ".local-evidence"); mkdirSync(cache);
  writeFileSync(join(cache, "base-sepolia-source-router.json"), JSON.stringify({ version: 1, role: "router", payload }));
  const guard = join(root, "guard.mjs"); writeFileSync(guard, 'globalThis.fetch = async () => { throw new Error("Network forbidden in cached CLI check"); };');
  return spawnSync(process.execPath, ["--import", "tsx", "--import", guard, "src/testnet-source-evidence-cli.ts"],
    { cwd: api, encoding: "utf8", timeout: 10000 });
}

it("reuses a valid cache in the actual CLI without RPC, source fetch or wallet access", () => {
  const result = isolatedCli(sourceFixture());
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ cached: true, evidenceSaved: true, sourceGraphValidated: true,
    snapshotAvailable: false, runtimeVerified: false, executionEnabled: false });
}, 15000);

it("an invalid cached null payload fails before any source fetch", () => {
  const result = isolatedCli(null);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "SOURCE_EVIDENCE_INVALID" });
}, 15000);

it("atomically publishes and revalidates only its selected public cache", () => {
  const path = folder(); const file = new TestnetSourceEvidenceFile(pathToFileURL(path + "/"), "router");
  expect(file.read()).toBeUndefined(); expect(file.readSnapshot()).toBeUndefined();
  writeFileSync(join(path, "base-sepolia-source-pool.json"), "keep");
  file.publish(prepareTestnetSourceEvidence("router", sourceFixture(), sourceBundle).payload);
  expect(prepareTestnetSourceEvidence("router", file.read(), sourceBundle).summary.sourceGraphValidated).toBe(true);
  expect(readdirSync(path).sort()).toEqual(["base-sepolia-source-pool.json", "base-sepolia-source-router.json"]);
  expect(readFileSync(join(path, "base-sepolia-source-pool.json"), "utf8")).toBe("keep");
  writeFileSync(join(path, "base-sepolia-deployment.json"), JSON.stringify(snapshotFixture()));
  expect(prepareTestnetSourceEvidence("router", file.read(), sourceBundle, file.readSnapshot()).summary.runtimeSnapshotMatches).toBe(true);
});

it("rejects invalid cache data, oversized files and symlinks without leaking paths", () => {
  const path = folder(); const target = join(path, "base-sepolia-source-router.json");
  const file = new TestnetSourceEvidenceFile(pathToFileURL(path + "/"), "router");
  writeFileSync(target, "{" ); expect(() => file.read()).toThrow("SOURCE_FILE_UNAVAILABLE");
  writeFileSync(target, "x".repeat(8000001)); expect(() => file.read()).toThrow("SOURCE_FILE_UNAVAILABLE");
  rmSync(target); const secret = join(path, "private.json"); writeFileSync(secret, "private"); symlinkSync(secret, target);
  expect(() => file.read()).toThrow("SOURCE_FILE_UNAVAILABLE");
  rmSync(target); writeFileSync(target, JSON.stringify({ version: 1, role: "router", payload: { ...sourceFixture(), chainId: "137" } }));
  expect(() => prepareTestnetSourceEvidence("router", file.read(), sourceBundle)).toThrow("SOURCE_EVIDENCE_INVALID");
});

it("failed publication preserves previous cache and other temporary files", () => {
  const path = folder(); const file = new TestnetSourceEvidenceFile(pathToFileURL(path + "/"), "router");
  file.publish(sourceFixture()); const before = readFileSync(join(path, "base-sepolia-source-router.json"), "utf8");
  writeFileSync(join(path, "other.tmp"), "keep");
  expect(() => file.publish({ content: "x".repeat(8000001) })).toThrow("SOURCE_FILE_UNAVAILABLE"); file.discardTemporary();
  expect(readFileSync(join(path, "base-sepolia-source-router.json"), "utf8")).toBe(before);
  expect(readFileSync(join(path, "other.tmp"), "utf8")).toBe("keep");
});

it.each(["read", "readSnapshot", "publish", "discardTemporary"] as const)("rejects a replaced evidence directory before %s without touching external files", action => {
  const root = folder(); const external = folder(); const cache = join(root, ".local-evidence"); mkdirSync(cache);
  const file = new TestnetSourceEvidenceFile(pathToFileURL(cache + "/"), "router");
  file.publish(sourceFixture()); // The directory must be checked on each operation, not only construction.
  rmSync(cache, { recursive: true }); symlinkSync(external, cache, "dir");
  const sentinels = {
    "base-sepolia-source-router.json": JSON.stringify({ version: 1, role: "router", payload: sourceFixture() }),
    "base-sepolia-deployment.json": JSON.stringify(snapshotFixture()),
    "other.tmp": "keep external bytes",
  };
  for (const [name, bytes] of Object.entries(sentinels)) writeFileSync(join(external, name), bytes);
  expect(() => action === "publish" ? file.publish({ changed: true }) : file[action]()).toThrow("SOURCE_FILE_UNAVAILABLE");
  expect(readdirSync(external).sort()).toEqual(Object.keys(sentinels).sort());
  for (const [name, bytes] of Object.entries(sentinels)) expect(readFileSync(join(external, name), "utf8")).toBe(bytes);
});

it.each([["--role", "../secret"], ["--save", "--save"], ["--role", "router", "--role", "pool"], ["--unknown"]])("rejects unsupported CLI options before external reads: %j", (...args) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/testnet-source-evidence-cli.ts", ...args],
    { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-source-evidence-unavailable", code: "SOURCE_INVALID_OPTION" });
}, 15000);
