import { afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { loadPinnedTestnetArtifacts } from "./testnet-artifacts";
import { TestnetDeploymentSnapshotReader, summarizeTestnetDeploymentSnapshot,
  type TestnetDeploymentSnapshotSource } from "./testnet-deployment-snapshot";

const bundle = loadPinnedTestnetArtifacts();
const now = 1790800002000;
const hash = `0x${"ab".repeat(32)}` as const;
function source(changes: Partial<TestnetDeploymentSnapshotSource> = {}): TestnetDeploymentSnapshotSource {
  return { async getChainId() { return 84532; },
    async getLatestBlock() { return { number: 123n, timestamp: 1790800000n, hash }; },
    async getBlockHash(number) { expect(number).toBe(123n); return hash; },
    async getCode(address, number) {
      expect(number).toBe(123n); const artifact = bundle.find(a => a.address.toLowerCase() === address.toLowerCase());
      if (!artifact) throw new Error("Unexpected contract address");
      return artifact.runtimeBytecode;
    }, ...changes };
}
afterEach(() => vi.useRealTimers());

it("collects all fixed deployment roles at one stable block without enabling execution", async () => {
  const reads: string[] = []; const original = source();
  const snapshot = await new TestnetDeploymentSnapshotReader(() => source({ async getCode(address, number) {
    reads.push(address.toLowerCase()); return original.getCode(address, number);
  } }), () => now).read(bundle);
  expect(reads.sort()).toEqual([
    "0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4", "0xc5290058841028f1614f3a6f0f5816cad0df5e27",
    "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", "0x46880b404cd35c165eddeff7421019f8dd25f4ad",
    "0x27f971cb582bf9e50f397e4d29a5c7a34f11faa2",
  ].sort());
  const summary = summarizeTestnetDeploymentSnapshot(snapshot);
  expect(summary).toMatchObject({ status: "testnet-deployment-snapshot-read-only", chainId: 84532,
    blockNumber: "123", checks: { sameChain: true, blockFresh: true, blockStable: true, allCodePresent: true },
    runtimeVerified: false, executionEnabled: false });
  expect(summary.contracts).toHaveLength(5);
  expect(summary.contracts.every(c => c.artifactRuntimeExactMatch)).toBe(true);
  expect(JSON.stringify(summary)).not.toContain("runtimeBytecode");
});

it("records byte-for-byte differences without masking or treating them as source verification", async () => {
  const snapshot = await new TestnetDeploymentSnapshotReader(() => source({ async getCode() { return "0x6001"; } }), () => now).read(bundle);
  const summary = summarizeTestnetDeploymentSnapshot(snapshot);
  expect(summary.contracts.every(c => !c.artifactRuntimeExactMatch && c.runtimeBytes === 2)).toBe(true);
  expect(snapshot.contracts.every(c => c.runtimeBytecode === "0x6001")).toBe(true);
  expect(summary.runtimeVerified).toBe(false);
});

it("rejects changed bundle identities, empty/odd/oversized code and wrong chain", async () => {
  const reader = new TestnetDeploymentSnapshotReader(() => source(), () => now);
  await expect(reader.read(bundle.map(a => a.role === "router" ? { ...a, address: bundle[1].address } : a)))
    .rejects.toMatchObject({ code: "ARTIFACT_INVALID" });
  for (const code of ["0x", "0x0", "0xzz", `0x${"00".repeat(65537)}`]) {
    await expect(new TestnetDeploymentSnapshotReader(() => source({ async getCode() { return code as `0x${string}`; } }), () => now).read(bundle))
      .rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_CODE_INVALID" });
  }
  await expect(new TestnetDeploymentSnapshotReader(() => source({ async getChainId() { return 137; } }), () => now).read(bundle))
    .rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_CHAIN_MISMATCH" });
});

it("rejects stale/future/zero block identity and changed block hash", async () => {
  for (const block of [
    { number: 123n, timestamp: 1790799881n, hash }, { number: 123n, timestamp: 1790800008n, hash },
    { number: 0n, timestamp: 1790800000n, hash },
    { number: 123n, timestamp: 1790800000n, hash: `0x${"00".repeat(32)}` as `0x${string}` },
  ]) await expect(new TestnetDeploymentSnapshotReader(() => source({ async getLatestBlock() { return block; } }), () => now).read(bundle)).rejects.toThrow();
  await expect(new TestnetDeploymentSnapshotReader(() => source({ async getBlockHash() { return `0x${"cd".repeat(32)}`; } }), () => now).read(bundle))
    .rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_BLOCK_CHANGED" });
});

it("checks final freshness and the original study deadline even for late provider results", async () => {
  let clock = now + 103000;
  await expect(new TestnetDeploymentSnapshotReader(() => source({ async getBlockHash() { clock += 20000; return hash; } }), () => clock).read(bundle))
    .rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_BLOCK_STALE" });
  clock = now;
  await expect(new TestnetDeploymentSnapshotReader(() => source({ async getBlockHash() { clock += 25000; return hash; } }), () => clock).read(bundle))
    .rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_TIMEOUT" });
});

it("bounds a hung provider study and propagates cancellation", async () => {
  vi.useFakeTimers(); vi.setSystemTime(now); let signal: AbortSignal | undefined;
  const reader = new TestnetDeploymentSnapshotReader(s => { signal = s; return source({ async getChainId() { return await new Promise<number>(() => {}); } }); });
  const failure = expect(reader.read(bundle)).rejects.toMatchObject({ code: "TESTNET_DEPLOYMENT_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(25000); await failure;
  expect(signal?.aborted).toBe(true);
});

it("sanitizes provider failures and rejects unsupported CLI options before network access", async () => {
  await expect(new TestnetDeploymentSnapshotReader(() => source({ async getChainId() { throw new Error("https://rpc.invalid/credential"); } }), () => now).read(bundle))
    .rejects.toMatchObject({ message: "TESTNET_DEPLOYMENT_RPC_UNAVAILABLE", code: "TESTNET_DEPLOYMENT_RPC_UNAVAILABLE" });
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/testnet-deployment-snapshot-cli.ts", "--invalid"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "testnet-deployment-snapshot-unavailable", code: "INVALID_OPTION" });
}, 15000); // Allow the bounded Node/tsx subprocess to start under parallel suite load.
