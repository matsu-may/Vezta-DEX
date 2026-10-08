import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { TestnetDeploymentError, type TestnetDeploymentSnapshot } from "../../tooling/evidence/testnet-deployment-snapshot";

/** Latest public evidence only. Unique temporary files isolate overlapping CLI processes. */
export class TestnetDeploymentEvidenceFile {
  private readonly target: URL;
  private readonly temporary: URL;
  constructor(private readonly directory: URL) {
    this.target = new URL("base-sepolia-deployment.json", directory);
    this.temporary = new URL(`base-sepolia-deployment.${randomUUID()}.tmp`, directory);
  }
  reset(): void {
    this.operation(() => { rmSync(this.target, { force: true }); rmSync(this.temporary, { force: true }); });
  }
  publish(snapshot: TestnetDeploymentSnapshot): void {
    this.operation(() => {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(this.temporary, `${JSON.stringify(snapshot)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(this.temporary, this.target);
    });
  }
  discardTemporary(): void { this.operation(() => rmSync(this.temporary, { force: true })); }
  private operation(fn: () => void): void {
    try { fn(); } catch { throw new TestnetDeploymentError("EVIDENCE_WRITE_UNAVAILABLE"); }
  }
}
