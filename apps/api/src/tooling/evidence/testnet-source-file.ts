import { randomUUID } from "node:crypto";
import { constants, openSync, fstatSync, lstatSync, closeSync, readSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TESTNET_ARTIFACT_MANIFEST, type TestnetArtifactRole } from "../../infrastructure/deployments/testnet-artifacts";
import { TestnetSourceError } from "./testnet-source-evidence";

/** Bounded local cache reads. No filesystem paths originate in a source payload. */
export class TestnetSourceEvidenceFile {
  private readonly target: URL;
  private readonly temporary: URL;
  private readonly directoryPath: string;
  constructor(private readonly directory: URL, private readonly role: TestnetArtifactRole) {
    if (!TESTNET_ARTIFACT_MANIFEST.some(x => x.role === role)) throw new TestnetSourceError("SOURCE_INVALID_OPTION");
    this.target = new URL(`base-sepolia-source-${role}.json`, directory);
    this.temporary = new URL(`base-sepolia-source-${role}.${randomUUID()}.tmp`, directory);
    // Remove the URL's trailing slash: lstat on a slash-suffixed symlink follows its target.
    this.directoryPath = resolve(fileURLToPath(directory));
  }
  read(): unknown | undefined {
    const entry = this.json(this.target, 8000000);
    if (entry === undefined) return undefined;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !("version" in entry) || entry.version !== 1 || !("role" in entry) || entry.role !== this.role || !("payload" in entry)) {
      throw new TestnetSourceError("SOURCE_EVIDENCE_INVALID");
    }
    return entry.payload;
  }
  readSnapshot(): unknown | undefined { return this.json(new URL("base-sepolia-deployment.json", this.directory), 1000000); }
  readRaw(): unknown {
    const raw = this.json(new URL(`base-sepolia-source-${this.role}.raw.json`, this.directory), 8000000);
    if (raw === undefined) throw new TestnetSourceError("SOURCE_FILE_UNAVAILABLE");
    return raw;
  }
  publish(payload: unknown): void {
    this.operation(() => {
      const bytes = Buffer.from(`${JSON.stringify({ version: 1, role: this.role, payload })}\n`);
      if (bytes.length > 8000000) throw new Error("Oversized cache");
      if (!this.directoryExists()) mkdirSync(this.directory);
      this.directoryExists();
      writeFileSync(this.temporary, bytes, { flag: "wx", mode: 0o600 });
      renameSync(this.temporary, this.target);
    });
  }
  discardTemporary(): void { this.operation(() => { if (this.directoryExists()) rmSync(this.temporary, { force: true }); }); }
  private json(path: URL, limit: number): unknown | undefined {
    let fd: number | undefined;
    try {
      if (!this.directoryExists()) return undefined;
      try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined; throw error; }
      const stat = fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw new Error("Invalid cache file");
      const body = Buffer.alloc(limit + 1); let size = 0;
      while (size < body.length) { const count = readSync(fd, body, size, body.length - size, null); if (count === 0) break; size += count; }
      if (size > limit) throw new Error("Oversized cache");
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, size))) as unknown;
    } catch { throw new TestnetSourceError("SOURCE_FILE_UNAVAILABLE"); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  private directoryExists(): boolean {
    try {
      if (!lstatSync(this.directoryPath).isDirectory()) throw new Error("Invalid cache directory");
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }
  private operation(fn: () => void): void {
    try { fn(); } catch { throw new TestnetSourceError("SOURCE_FILE_UNAVAILABLE"); }
  }
}
