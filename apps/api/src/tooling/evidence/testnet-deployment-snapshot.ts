import { keccak256, type Address, type Hex } from "viem";
import { TESTNET_ARTIFACT_MANIFEST, TestnetArtifactError, type PinnedTestnetArtifact } from "../../infrastructure/deployments/testnet-artifacts";

export interface TestnetDeploymentSnapshotSource {
  getChainId(): Promise<number>;
  getLatestBlock(): Promise<{ number: bigint; timestamp: bigint; hash: Hex }>;
  getCode(address: Address, number: bigint): Promise<Hex>;
  getBlockHash(number: bigint): Promise<Hex>;
}
export class TestnetDeploymentError extends Error {
  constructor(readonly code: "TESTNET_DEPLOYMENT_CHAIN_MISMATCH" | "TESTNET_DEPLOYMENT_BLOCK_INVALID"
    | "TESTNET_DEPLOYMENT_BLOCK_STALE" | "TESTNET_DEPLOYMENT_BLOCK_CHANGED" | "TESTNET_DEPLOYMENT_CODE_INVALID"
    | "TESTNET_DEPLOYMENT_TIMEOUT" | "TESTNET_DEPLOYMENT_RPC_UNAVAILABLE" | "TESTNET_DEPLOYMENT_CLOCK_INVALID"
    | "EVIDENCE_WRITE_UNAVAILABLE" | "INVALID_OPTION") { super(code); }
}
export interface TestnetDeploymentSnapshot {
  version: 1; chainId: 84532; blockNumber: string; blockHash: Hex; timestamp: string;
  observedAt: string; recordedAt: string; source: "base-sepolia-rpc";
  contracts: Array<{ role: PinnedTestnetArtifact["role"]; address: Address; packageName: string; version: string;
    artifactSha256: string; artifactRuntimeHash: Hex; runtimeBytecode: Hex; runtimeHash: Hex;
    artifactRuntimeExactMatch: boolean }>;
}
function clock(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_CLOCK_INVALID");
  return value;
}
function fresh(timestampMs: number, now: number): void {
  if (now - timestampMs > 120000 || timestampMs > now + 5000) throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_BLOCK_STALE");
}
function orderedBundle(bundle: readonly PinnedTestnetArtifact[]): PinnedTestnetArtifact[] {
  if (bundle.length !== 5 || new Set(bundle.map(a => a.role)).size !== 5) throw new TestnetArtifactError("ARTIFACT_INVALID");
  return TESTNET_ARTIFACT_MANIFEST.map(definition => {
    const item = bundle.find(a => a.role === definition.role);
    if (!item || item.address.toLowerCase() !== definition.address.toLowerCase() || item.sha256 !== definition.sha256
      || item.version !== definition.version || item.packageName !== definition.packageName) throw new TestnetArtifactError("ARTIFACT_INVALID");
    return item;
  });
}

export class TestnetDeploymentSnapshotReader {
  constructor(private readonly createSource: (signal: AbortSignal) => TestnetDeploymentSnapshotSource,
    private readonly now = Date.now) {}

  async read(bundle: readonly PinnedTestnetArtifact[]): Promise<TestnetDeploymentSnapshot> {
    const artifacts = orderedBundle(bundle); const startedAt = clock(this.now());
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new TestnetDeploymentError("TESTNET_DEPLOYMENT_TIMEOUT")); }, 25000);
    });
    try { return await Promise.race([this.probe(this.createSource(controller.signal), artifacts, startedAt, controller.signal), timeout]); }
    catch (error) {
      if (error instanceof TestnetDeploymentError || error instanceof TestnetArtifactError) throw error;
      throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); }
  }

  private async probe(source: TestnetDeploymentSnapshotSource, artifacts: readonly PinnedTestnetArtifact[],
    startedAt: number, signal: AbortSignal): Promise<TestnetDeploymentSnapshot> {
    if (await source.getChainId() !== 84532) throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_CHAIN_MISMATCH");
    signal.throwIfAborted();
    const block = await source.getLatestBlock(); signal.throwIfAborted();
    if (typeof block.number !== "bigint" || block.number <= 0n || block.number >= 2n ** 256n
      || typeof block.timestamp !== "bigint" || block.timestamp <= 0n
      || block.timestamp > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
      || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || BigInt(block.hash) === 0n) {
      throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_BLOCK_INVALID");
    }
    const timestampMs = Number(block.timestamp) * 1000; fresh(timestampMs, clock(this.now()));
    const contracts = await Promise.all(artifacts.map(async artifact => {
      signal.throwIfAborted(); const code = await source.getCode(artifact.address, block.number); signal.throwIfAborted();
      if (typeof code !== "string" || code.length > 131074 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
        throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_CODE_INVALID");
      }
      return { role: artifact.role, address: artifact.address, packageName: artifact.packageName, version: artifact.version,
        artifactSha256: artifact.sha256, artifactRuntimeHash: keccak256(artifact.runtimeBytecode),
        runtimeBytecode: code, runtimeHash: keccak256(code),
        artifactRuntimeExactMatch: code.toLowerCase() === artifact.runtimeBytecode.toLowerCase() };
    }));
    signal.throwIfAborted(); const confirmedHash = await source.getBlockHash(block.number); signal.throwIfAborted();
    if (typeof confirmedHash !== "string" || confirmedHash.toLowerCase() !== block.hash.toLowerCase()) {
      throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_BLOCK_CHANGED");
    }
    const finishedAt = clock(this.now());
    if (finishedAt < startedAt || finishedAt - startedAt >= 25000) throw new TestnetDeploymentError("TESTNET_DEPLOYMENT_TIMEOUT");
    fresh(timestampMs, finishedAt);
    return { version: 1, chainId: 84532, blockNumber: block.number.toString(), blockHash: block.hash,
      timestamp: block.timestamp.toString(), observedAt: new Date(timestampMs).toISOString(),
      recordedAt: new Date(finishedAt).toISOString(), source: "base-sepolia-rpc", contracts };
  }
}

export function summarizeTestnetDeploymentSnapshot(snapshot: TestnetDeploymentSnapshot) {
  return { status: "testnet-deployment-snapshot-read-only", chainId: snapshot.chainId,
    blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, observedAt: snapshot.observedAt,
    checks: { sameChain: true, blockFresh: true, blockStable: true, allCodePresent: true },
    contracts: snapshot.contracts.map(({ role, address, artifactSha256, artifactRuntimeHash,
      runtimeBytecode, runtimeHash, artifactRuntimeExactMatch }) => ({ role, address, artifactSha256,
      artifactRuntimeHash, runtimeHash, runtimeBytes: (runtimeBytecode.length - 2) / 2, artifactRuntimeExactMatch })),
    independentRebuildVerified: false as const, runtimeVerified: false as const, executionEnabled: false as const };
}
