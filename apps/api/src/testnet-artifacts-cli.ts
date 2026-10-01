import { loadPinnedTestnetArtifacts, reviewTestnetArtifactBundle, TestnetArtifactError } from "./testnet-artifacts";

try {
  if (process.argv.length !== 2) throw new TestnetArtifactError("ARTIFACT_INVALID");
  process.stdout.write(`${JSON.stringify(reviewTestnetArtifactBundle(loadPinnedTestnetArtifacts()))}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ status: "testnet-artifacts-unavailable",
    code: error instanceof TestnetArtifactError ? error.code : "ARTIFACT_INVALID" })}\n`);
  process.exitCode = 1;
}
