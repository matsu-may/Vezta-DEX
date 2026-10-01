import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { TestnetSourceEvidenceFile } from "./testnet-source-file";
import { prepareTestnetSourceEvidence } from "./testnet-source-evidence";
import { sourceBundle, sourceFixture, sourceSupersetFixture, snapshotFixture } from "./testnet-source.test-helper";
const owned: string[] = [];
function folder() { const path = mkdtempSync(join(tmpdir(), "dex-source-evidence-")); owned.push(path); return path; }
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });

function isolatedCli(payload: unknown, fromRaw = false) {
  const root = folder(); const api = join(root, "apps/api"); const src = join(api, "src"); mkdirSync(src, { recursive: true });
  for (const file of ["testnet-source-evidence-cli.ts", "testnet-source-evidence.ts", "testnet-source-fetch.ts", "testnet-source-file.ts", "testnet-artifacts.ts"])
    copyFileSync(new URL(file, import.meta.url), join(src, file));
  writeFileSync(join(api, "package.json"), '{"type":"module"}'); symlinkSync(new URL("../node_modules", import.meta.url), join(api, "node_modules"));
  const cache = join(root, ".local-evidence"); mkdirSync(cache);
  writeFileSync(join(cache, fromRaw ? "base-sepolia-source-router.raw.json" : "base-sepolia-source-router.json"),
    JSON.stringify(fromRaw ? payload : { version: 1, role: "router", payload }));
  const guard = join(root, "guard.mjs"); writeFileSync(guard, 'globalThis.fetch = async () => { throw new Error("Network forbidden in cached CLI check"); };');
  return { ...spawnSync(process.execPath, ["--import", "tsx", "--import", guard, "src/testnet-source-evidence-cli.ts",
    ...(fromRaw ? ["--from-raw", "--save"] : [])], { cwd: api, encoding: "utf8", timeout: 10000 }), root };
}

it("reuses a valid cache in the actual CLI without RPC, source fetch or wallet access", () => {
  const fixture = sourceFixture(); const path = "contracts/SwapRouter02.sol";
  Object.assign(fixture.stdJsonInput.sources[path], { keccak256: fixture.metadata.sources[path].keccak256 });
  const result = isolatedCli(fixture);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ cached: true, evidenceSaved: true, sourceGraphValidated: true,
    snapshotAvailable: false, runtimeVerified: false, executionEnabled: false });
}, 15000);

it("an invalid cached null payload fails before any source fetch", () => {
  const result = isolatedCli(null);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "SOURCE_EVIDENCE_INVALID", stage: "identity" });
}, 15000);

it("imports a raw provider superset with the real CLI, preserving raw bytes and saving only the verified reconstruction", () => {
  const fixture = sourceSupersetFixture(); const before = JSON.stringify(fixture);
  const result = isolatedCli(fixture, true);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ cached: false, evidenceSaved: true, sourceCount: 1,
    compilerInputMode: "metadata-listed-reconstruction", independentRebuildVerified: false, runtimeVerified: false, executionEnabled: false });
  expect(readFileSync(join(result.root, ".local-evidence/base-sepolia-source-router.raw.json"), "utf8")).toBe(before);
  const saved = JSON.parse(readFileSync(join(result.root, ".local-evidence/base-sepolia-source-router.json"), "utf8"));
  expect(Object.keys(saved.payload.stdJsonInput.sources)).toEqual(["contracts/SwapRouter02.sol"]);
}, 15000);

it("rejects invalid raw evidence without publishing a cache or using the network", () => {
  const result = isolatedCli({ ...sourceSupersetFixture(), chainId: "137" }, true);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "SOURCE_EVIDENCE_INVALID", stage: "identity" });
  expect(existsSync(join(result.root, ".local-evidence/base-sepolia-source-router.json"))).toBe(false);
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

it("rejects missing raw files and raw symlinks without reading their targets", () => {
  const path = folder(); const file = new TestnetSourceEvidenceFile(pathToFileURL(path + "/"), "router");
  expect(() => file.readRaw()).toThrow("SOURCE_FILE_UNAVAILABLE");
  const external = folder(); const target = join(external, "raw.json");
  const bytes = JSON.stringify(sourceFixture()); writeFileSync(target, bytes);
  symlinkSync(target, join(path, "base-sepolia-source-router.raw.json"));
  expect(() => file.readRaw()).toThrow("SOURCE_FILE_UNAVAILABLE");
  expect(readFileSync(target, "utf8")).toBe(bytes);
});

it.each(["read", "readRaw", "readSnapshot", "publish", "discardTemporary"] as const)("rejects a replaced evidence directory before %s without touching external files", action => {
  const root = folder(); const external = folder(); const cache = join(root, ".local-evidence"); mkdirSync(cache);
  const file = new TestnetSourceEvidenceFile(pathToFileURL(cache + "/"), "router");
  file.publish(sourceFixture()); // The directory must be checked on each operation, not only construction.
  rmSync(cache, { recursive: true }); symlinkSync(external, cache, "dir");
  const sentinels = {
    "base-sepolia-source-router.json": JSON.stringify({ version: 1, role: "router", payload: sourceFixture() }),
    "base-sepolia-source-router.raw.json": JSON.stringify(sourceSupersetFixture()),
    "base-sepolia-deployment.json": JSON.stringify(snapshotFixture()),
    "other.tmp": "keep external bytes",
  };
  for (const [name, bytes] of Object.entries(sentinels)) writeFileSync(join(external, name), bytes);
  expect(() => action === "publish" ? file.publish({ changed: true }) : file[action]()).toThrow("SOURCE_FILE_UNAVAILABLE");
  expect(readdirSync(external).sort()).toEqual(Object.keys(sentinels).sort());
  for (const [name, bytes] of Object.entries(sentinels)) expect(readFileSync(join(external, name), "utf8")).toBe(bytes);
});

it.each([["--role", "../secret"], ["--save", "--save"], ["--from-raw", "--from-raw"], ["--role", "router", "--role", "pool"], ["--unknown"]])("rejects unsupported CLI options before external reads: %j", (...args) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/testnet-source-evidence-cli.ts", ...args],
    { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-source-evidence-unavailable", code: "SOURCE_INVALID_OPTION" });
}, 15000);
