import { loadPinnedTestnetArtifacts, TESTNET_ARTIFACT_MANIFEST, TestnetArtifactError, type TestnetArtifactRole } from "./testnet-artifacts";
import { prepareTestnetSourceEvidence, TestnetSourceError } from "./testnet-source-evidence";
import { fetchTestnetSourceEvidence } from "./testnet-source-fetch";
import { TestnetSourceEvidenceFile } from "./testnet-source-file";

let evidence: TestnetSourceEvidenceFile | undefined;
async function main() {
  const args = process.argv.slice(2); let role: TestnetArtifactRole = "router"; let roleSet = false; let save = false; let fromRaw = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--save" && !save) save = true;
    else if (args[i] === "--from-raw" && !fromRaw) fromRaw = true;
    else if (args[i] === "--role" && !roleSet && TESTNET_ARTIFACT_MANIFEST.some(x => x.role === args[i + 1])) {
      role = args[++i] as TestnetArtifactRole; roleSet = true;
    } else throw new TestnetSourceError("SOURCE_INVALID_OPTION");
  }
  const bundle = loadPinnedTestnetArtifacts();
  evidence = new TestnetSourceEvidenceFile(new URL("../../../.local-evidence/", import.meta.url), role);
  const cached = evidence.read(); const snapshot = evidence.readSnapshot();
  const raw = cached === undefined ? (fromRaw ? evidence.readRaw() : await fetchTestnetSourceEvidence(role)) : cached;
  const result = prepareTestnetSourceEvidence(role, raw, bundle, snapshot);
  if (save && cached === undefined) evidence.publish(result.payload);
  process.stdout.write(`${JSON.stringify({ ...result.summary, cached: cached !== undefined, evidenceSaved: save || cached !== undefined })}\n`);
}
void main().catch(error => {
  try { evidence?.discardTemporary(); } catch { /* Only bounded error codes reach stdout. */ }
  process.stdout.write(`${JSON.stringify({ status: "testnet-source-evidence-unavailable",
    code: error instanceof TestnetSourceError || error instanceof TestnetArtifactError ? error.code : "SOURCE_EVIDENCE_INVALID",
    ...(error instanceof TestnetSourceError && error.stage ? { stage: error.stage } : {}),
    ...(error instanceof TestnetSourceError && error.httpStatus ? { httpStatus: error.httpStatus } : {}) })}\n`);
  process.exitCode = 1;
});
