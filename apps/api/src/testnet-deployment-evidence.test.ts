import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { TestnetDeploymentEvidenceFile } from "./testnet-deployment-evidence";
import type { TestnetDeploymentSnapshot } from "./testnet-deployment-snapshot";
import { loadPinnedTestnetArtifacts } from "./testnet-artifacts";
import { keccak256 } from "viem";

const directories: string[] = [];
function directory() { const path = mkdtempSync(join(tmpdir(), "vezta-dex-public-evidence-")); directories.push(path); return path; }
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
const snapshot: TestnetDeploymentSnapshot = { version: 1, chainId: 84532, blockNumber: "123",
  blockHash: `0x${"ab".repeat(32)}`, timestamp: "1790800000", observedAt: "2026-09-30T20:26:40.000Z",
  recordedAt: "2026-09-30T20:26:42.000Z", source: "base-sepolia-rpc",
  contracts: loadPinnedTestnetArtifacts().map(a => ({ role: a.role, address: a.address, packageName: a.packageName,
    version: a.version, artifactSha256: a.sha256, artifactRuntimeHash: keccak256(a.runtimeBytecode),
    runtimeBytecode: "0x6001", runtimeHash: keccak256("0x6001"), artifactRuntimeExactMatch: false })) };

it("publishes JSON atomically and clears old evidence before a failed refresh", () => {
  const path = directory(); const target = join(path, "base-sepolia-deployment.json");
  const file = new TestnetDeploymentEvidenceFile(pathToFileURL(path + "/"));
  file.reset(); file.publish(snapshot);
  const saved = JSON.parse(readFileSync(target, "utf8"));
  expect(saved).toMatchObject({ chainId: 84532, blockNumber: "123", source: "base-sepolia-rpc" });
  expect(saved.contracts).toHaveLength(5);
  expect(saved.contracts.every((c: { runtimeBytecode: string }) => c.runtimeBytecode === "0x6001")).toBe(true);
  file.reset(); file.discardTemporary();
  expect(existsSync(target)).toBe(false);
});

it("leaves unrelated and other temporary evidence files intact", () => {
  const path = directory(); const other = join(path, "other.tmp"); writeFileSync(other, "keep");
  const a = new TestnetDeploymentEvidenceFile(pathToFileURL(path + "/"));
  const b = new TestnetDeploymentEvidenceFile(pathToFileURL(path + "/"));
  a.reset(); b.reset(); a.publish(snapshot); b.discardTemporary();
  expect(readFileSync(other, "utf8")).toBe("keep");
  expect(existsSync(join(path, "base-sepolia-deployment.json"))).toBe(true);
});

it("reports bounded file errors instead of exposing filesystem paths", () => {
  const path = directory(); const blocked = join(path, "blocked"); writeFileSync(blocked, "keep");
  const file = new TestnetDeploymentEvidenceFile(pathToFileURL(blocked + "/"));
  expect(() => file.publish(snapshot)).toThrow("EVIDENCE_WRITE_UNAVAILABLE");
  expect(readFileSync(blocked, "utf8")).toBe("keep");
});
