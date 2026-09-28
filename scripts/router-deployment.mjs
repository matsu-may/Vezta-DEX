import { createHash } from "node:crypto";

export const ROUTER_ADDRESS = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f";
export const SOURCE_FINGERPRINTS = Object.freeze({
  dispatcher: "5f40089555d35d6ece37d61476c48280a8029062eb1dda17855eb7fe517a9882",
  v4Interface: "a577e593bd1948ffcf9ce26964ae1e47bafcf6dffcd40baeb700bcb902367a53",
});
const hex = /^0x(?:[0-9a-fA-F]{2})+$/;

function sourceHash(sources, suffix) {
  const matches = Object.entries(sources ?? {}).filter(([path]) => path === suffix || path.endsWith(`/${suffix}`));
  const content = matches.length === 1 ? matches[0][1]?.content : undefined;
  return typeof content === "string" ? createHash("sha256").update(content).digest("hex") : undefined;
}

/** Observations for review; matching two files does not establish the complete dependency graph or immutables. */
export function inspectDeploymentEvidence(contract, snapshot, pins = SOURCE_FINGERPRINTS) {
  if (!contract || ![137, "137"].includes(contract.chainId) || typeof contract.address !== "string" || contract.address.toLowerCase() !== ROUTER_ADDRESS.toLowerCase() ||
    snapshot?.chainId !== 137 || snapshot.address !== ROUTER_ADDRESS || !hex.test(snapshot.bytecode ?? "") ||
    !hex.test(contract.runtimeBytecode?.onchainBytecode ?? "") || !["exact_match", "match"].includes(contract.runtimeMatch)) throw new Error("INVALID_DEPLOYMENT_EVIDENCE");
  const metadata = typeof contract.metadata === "string" ? JSON.parse(contract.metadata) : contract.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("INVALID_DEPLOYMENT_EVIDENCE");
  const targets = Object.entries(metadata.settings?.compilationTarget ?? {});
  const version = metadata.compiler?.version;
  const runs = metadata.settings?.optimizer?.runs;
  return {
    chainId: 137, router: ROUTER_ADDRESS,
    blockNumber: snapshot.blockNumber, observedAt: new Date(Number(BigInt(snapshot.timestamp)) * 1000).toISOString(),
    runtimeBytes: (snapshot.bytecode.length - 2) / 2,
    runtimeLengthMatchesRelease: (snapshot.bytecode.length - 2) / 2 === 24_380,
    runtimeExactMatch: contract.runtimeMatch === "exact_match",
    runtimeMatchesRpc: snapshot.bytecode.toLowerCase() === contract.runtimeBytecode.onchainBytecode.toLowerCase(),
    compilationTargetMatches: targets.length === 1 && targets[0][1] === "UniversalRouter" && (targets[0][0] === "contracts/UniversalRouter.sol" || targets[0][0].endsWith("/contracts/UniversalRouter.sol")),
    compilerVersion: typeof version === "string" && /^0\.8\.\d+\+commit\.[a-f0-9]{8}$/.test(version) ? version : undefined,
    optimizerRuns: Number.isSafeInteger(runs) && runs >= 0 ? runs : undefined,
    dispatcherMatchesPinnedHash: sourceHash(contract.sources, "contracts/base/Dispatcher.sol") === pins.dispatcher,
    v4InterfaceMatchesPinnedHash: sourceHash(contract.sources, "src/interfaces/IV4Router.sol") === pins.v4Interface,
    deployedSourceVerified: false, calldataValidated: false,
  };
}
