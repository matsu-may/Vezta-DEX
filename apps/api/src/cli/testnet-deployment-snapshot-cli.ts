import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";
import { loadPinnedTestnetArtifacts, TestnetArtifactError } from "../infrastructure/deployments/testnet-artifacts";
import { TestnetDeploymentError, TestnetDeploymentSnapshotReader, summarizeTestnetDeploymentSnapshot } from "../tooling/evidence/testnet-deployment-snapshot";
import { TestnetRpcDiagnostics } from "../infrastructure/rpc/testnet-rpc-diagnostics";
import { TestnetDeploymentEvidenceFile } from "../infrastructure/deployments/testnet-deployment-evidence";

const directory = new URL("../../../../.local-evidence/", import.meta.url);
const evidence = new TestnetDeploymentEvidenceFile(directory);
const diagnostics = new TestnetRpcDiagnostics();
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg !== "--save")) throw new TestnetDeploymentError("INVALID_OPTION");
  const save = args.length === 1;
  if (save) evidence.reset();
  const bundle = loadPinnedTestnetArtifacts();
  const env = new URL("../../.env", import.meta.url);
  if (existsSync(env)) process.loadEnvFile(env);
  const reader = new TestnetDeploymentSnapshotReader(signal => diagnostics.wrap(
    createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal)));
  const snapshot = await reader.read(bundle);
  if (save) evidence.publish(snapshot);
  process.stdout.write(`${JSON.stringify({ ...summarizeTestnetDeploymentSnapshot(snapshot), evidenceSaved: save })}\n`);
}
void main().catch(error => {
  // A failed refresh cannot leave a new success file or partially written evidence.
  try { evidence.discardTemporary(); } catch { /* Report only bounded codes. */ }
  process.stdout.write(`${JSON.stringify({ status: "testnet-deployment-snapshot-unavailable",
    code: error instanceof TestnetDeploymentError || error instanceof TestnetArtifactError ? error.code : "TESTNET_DEPLOYMENT_RPC_UNAVAILABLE",
    rpcDiagnostics: diagnostics.snapshot() })}\n`);
  process.exitCode = 1;
});
