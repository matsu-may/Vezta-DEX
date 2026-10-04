import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";

it("preserves the committed LP hash across restart after an interrupted private write", async () => {
  const f = await testnetLpWalletFixture(), path = mkdtempSync(join(tmpdir(), "lp-restart-"));
  try {
    const store = new TestnetLpWalletStore(path, f.clock), study = store.issue(f.study, "{}");
    const id = study.contextId!, hash = `0x${"ab".repeat(32)}`;
    store.bindHash(id, hash);
    writeFileSync(join(path, `${id}.${"12".repeat(8)}.tmp`), '{"originalHash":', { mode: 0o600 });
    expect(new TestnetLpWalletStore(path, f.clock).read(id)).toMatchObject({ originalHash: hash, study });
    expect(readdirSync(path)).toEqual([`${id}.json`]);
  } finally { rmSync(path, { recursive: true }); }
});

it.each(["permissions", "oversized", "symlink", "name"])("rejects an unsafe orphan LP file: %s", async kind => {
  const f = await testnetLpWalletFixture(), path = mkdtempSync(join(tmpdir(), "lp-restart-"));
  try {
    const id = new TestnetLpWalletStore(path, f.clock).issue(f.study, "{}").contextId!;
    const temp = join(path, kind === "name" ? "unknown.tmp" : `${id}.${"12".repeat(8)}.tmp`);
    if (kind === "symlink") symlinkSync(join(path, `${id}.json`), temp);
    else writeFileSync(temp, kind === "oversized" ? " ".repeat(32769) : "partial", { mode: kind === "permissions" ? 0o644 : 0o600 });
    expect(() => new TestnetLpWalletStore(path, f.clock)).toThrow("TESTNET_LP_STORAGE_UNAVAILABLE");
  } finally { rmSync(path, { recursive: true }); }
});
