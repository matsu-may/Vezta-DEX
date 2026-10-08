import { createHash } from "node:crypto";
import { keccak256, stringToHex, type Hex } from "viem";
import { TESTNET_ARTIFACT_MANIFEST, type TestnetArtifactRole, type PinnedTestnetArtifact } from "../../infrastructure/deployments/testnet-artifacts";

type SourceValidationStage = "artifact" | "identity" | "compiler" | "target" | "source-graph" | "source-content" | "runtime" | "snapshot";
export class TestnetSourceError extends Error {
  constructor(readonly code: "SOURCE_EVIDENCE_INVALID" | "SOURCE_SNAPSHOT_INVALID" | "SOURCE_RUNTIME_MISMATCH"
    | "SOURCE_TIMEOUT" | "SOURCE_NETWORK_UNAVAILABLE" | "SOURCE_HTTP_UNAVAILABLE" | "SOURCE_NOT_FOUND"
    | "SOURCE_RATE_LIMITED" | "SOURCE_RESPONSE_TOO_LARGE" | "SOURCE_FILE_UNAVAILABLE" | "SOURCE_INVALID_OPTION",
    readonly httpStatus?: number, readonly stage?: SourceValidationStage) { super(code); }
}
const reject = (code: TestnetSourceError["code"] = "SOURCE_EVIDENCE_INVALID"): never => { throw new TestnetSourceError(code); };
const object = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== "object" || Array.isArray(x) || Object.getPrototypeOf(x) !== Object.prototype) return reject();
  return x as Record<string, unknown>;
};
const hex = (x: unknown): x is Hex => typeof x === "string" && x.length <= 131074 && /^0x(?:[0-9a-fA-F]{2})+$/.test(x);
function artifacts(bundle: readonly PinnedTestnetArtifact[]) {
  if (bundle.length !== 5 || new Set(bundle.map(x => x.role)).size !== 5) return reject();
  return TESTNET_ARTIFACT_MANIFEST.map(pin => {
    const a = bundle.find(x => x.role === pin.role);
    if (!a || a.address.toLowerCase() !== pin.address.toLowerCase() || a.sha256 !== pin.sha256
      || a.version !== pin.version || a.packageName !== pin.packageName || !hex(a.runtimeBytecode)) return reject();
    return a;
  });
}

function checkSnapshot(value: unknown, bundle: readonly PinnedTestnetArtifact[], role: TestnetArtifactRole, code: Hex) {
  try {
    const s = object(value);
    if (s.version !== 1 || s.chainId !== 84532 || s.source !== "base-sepolia-rpc"
      || typeof s.blockNumber !== "string" || !/^[1-9][0-9]{0,77}$/.test(s.blockNumber) || BigInt(s.blockNumber) >= 2n ** 256n
      || typeof s.blockHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(s.blockHash) || BigInt(s.blockHash) === 0n
      || typeof s.timestamp !== "string" || !/^[1-9][0-9]{0,15}$/.test(s.timestamp)) return reject("SOURCE_SNAPSHOT_INVALID");
    const time = Number(s.timestamp) * 1000; const recorded = typeof s.recordedAt === "string" ? Date.parse(s.recordedAt) : NaN;
    if (!Number.isSafeInteger(time) || s.observedAt !== new Date(time).toISOString() || !Number.isFinite(recorded)
      || recorded < time - 5000 || recorded > time + 120000 || !Array.isArray(s.contracts) || s.contracts.length !== 5) return reject("SOURCE_SNAPSHOT_INVALID");
    const rows = s.contracts.map(object);
    if (new Set(rows.map(x => x.role)).size !== 5) return reject("SOURCE_SNAPSHOT_INVALID");
    for (const a of bundle) {
      const row = rows.find(x => x.role === a.role);
      if (!row || typeof row.address !== "string" || row.address.toLowerCase() !== a.address.toLowerCase()
        || row.packageName !== a.packageName || row.version !== a.version || row.artifactSha256 !== a.sha256
        || row.artifactRuntimeHash !== keccak256(a.runtimeBytecode) || !hex(row.runtimeBytecode)
        || row.runtimeHash !== keccak256(row.runtimeBytecode)
        || row.artifactRuntimeExactMatch !== (row.runtimeBytecode.toLowerCase() === a.runtimeBytecode.toLowerCase())) return reject("SOURCE_SNAPSHOT_INVALID");
    }
    if ((rows.find(x => x.role === role)!.runtimeBytecode as string).toLowerCase() !== code.toLowerCase()) return reject("SOURCE_RUNTIME_MISMATCH");
    return s.blockNumber;
  } catch (error) {
    if (error instanceof TestnetSourceError && error.code === "SOURCE_RUNTIME_MISMATCH") throw error;
    return reject("SOURCE_SNAPSHOT_INVALID");
  }
}

/** Graph consistency and compiler input preparation only; no independent compiler proof. */
export function prepareTestnetSourceEvidence(role: TestnetArtifactRole, value: unknown,
  bundle: readonly PinnedTestnetArtifact[], snapshot?: unknown) {
  let stage: SourceValidationStage = "artifact";
  try {
    const pinned = artifacts(bundle); const pin = TESTNET_ARTIFACT_MANIFEST.find(x => x.role === role);
    if (!pin) return reject();
    stage = "identity";
    const data = object(value);
    if (![84532, "84532"].includes(data.chainId as number | string) || typeof data.address !== "string"
      || data.address.toLowerCase() !== pin.address.toLowerCase() || !["match", "exact_match"].includes(data.runtimeMatch as string)) return reject();
    stage = "compiler";
    const metadata = object(data.metadata); const compilation = object(data.compilation);
    const compilerVersion = object(metadata.compiler).version;
    if (compilation.language !== "Solidity" || typeof compilerVersion !== "string"
      || !/^0\.\d+\.\d+\+commit\.[a-f0-9]{8}$/.test(compilerVersion) || compilation.compilerVersion !== compilerVersion) return reject();
    stage = "target";
    const targets = Object.entries(object(object(metadata.settings).compilationTarget));
    if (targets.length !== 1 || targets[0][1] !== pin.contractName
      || !(targets[0][0] === pin.sourceName || targets[0][0].endsWith(`/${pin.sourceName}`))) return reject();
    stage = "source-graph";
    const target = targets[0][0]; const original = object(data.stdJsonInput);
    const sources = object(original.sources); const hashes = object(metadata.sources); const settings = object(original.settings);
    const keys = Object.keys(hashes).sort(); const available = Object.keys(sources).sort();
    if (original.language !== "Solidity" || keys.length === 0 || keys.length > 200 || available.length > 512
      || !keys.every(path => Object.hasOwn(sources, path)) || !Object.hasOwn(hashes, target)
      || Buffer.byteLength(JSON.stringify(settings)) > 500000) return reject();
    const literal: Record<string, { content: string }> = {}; const normalizedHashes: Record<string, { keccak256: string }> = {};
    let sourceBytes = 0; let availableBytes = 0;
    stage = "source-content";
    for (const path of available) {
      if (path.length === 0 || path.length > 512 || path.includes("\0") || ["__proto__", "constructor", "prototype"].includes(path)) return reject();
      const source = object(sources[path]);
      if (typeof source.content !== "string" || Object.keys(source).some(key => key !== "content" && key !== "keccak256")) return reject();
      const bytes = Buffer.byteLength(source.content); availableBytes += bytes;
      if (availableBytes > 4000000) return reject();
      const digest = keccak256(stringToHex(source.content));
      if (Object.hasOwn(source, "keccak256") && source.keccak256 !== digest) return reject();
      if (Object.hasOwn(hashes, path)) {
        if (object(hashes[path]).keccak256 !== digest) return reject();
        sourceBytes += bytes;
        literal[path] = { content: source.content }; normalizedHashes[path] = { keccak256: digest };
      }
    }
    stage = "runtime";
    const code = object(data.runtimeBytecode).onchainBytecode;
    if (!hex(code)) return reject();
    const input = { language: "Solidity", sources: literal, settings: { ...structuredClone(settings),
      outputSelection: { "*": { "": ["ast"] }, [target]: { [pin.contractName]: ["metadata", "evm.bytecode", "evm.deployedBytecode"] } } } };
    const payload = { chainId: "84532", address: pin.address, runtimeMatch: data.runtimeMatch as string,
      compilerInputMode: "metadata-listed-reconstruction",
      compilation: { language: "Solidity", compilerVersion }, metadata: { compiler: { version: compilerVersion },
        settings: { compilationTarget: { [target]: pin.contractName } }, sources: normalizedHashes },
      stdJsonInput: { language: "Solidity", sources: structuredClone(literal), settings: structuredClone(settings) },
      runtimeBytecode: { onchainBytecode: code } };
    stage = "snapshot";
    const blockNumber = snapshot === undefined ? undefined : checkSnapshot(snapshot, pinned, role, code);
    return { payload, input, summary: { status: "testnet-source-evidence-read-only", role, chainId: 84532, address: pin.address,
      compilerVersion, compilationTarget: `${target}:${pin.contractName}`, compilerInputMode: "metadata-listed-reconstruction", sourceCount: keys.length, sourceBytes,
      inputSha256: createHash("sha256").update(JSON.stringify(input)).digest("hex"), runtimeHash: keccak256(code),
      sourceGraphValidated: true, snapshotAvailable: snapshot !== undefined, runtimeSnapshotMatches: snapshot === undefined ? null : true,
      ...(blockNumber ? { blockNumber } : {}), independentRebuildVerified: false, runtimeVerified: false, executionEnabled: false } };
  } catch (error) {
    if (error instanceof TestnetSourceError) throw new TestnetSourceError(error.code, error.httpStatus, error.stage ?? stage);
    throw new TestnetSourceError("SOURCE_EVIDENCE_INVALID", undefined, stage);
  }
}
