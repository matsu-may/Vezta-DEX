import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { inspectTestnetLpTransaction, testnetLpStudySchema, type TestnetLpStudy } from "@vezta-dex/core";
import { TestnetLpError, lpAssert } from "./testnet-lp-position";
const schema = z.object({ study: testnetLpStudySchema, state: z.string().max(8192), issuedAt: z.number().int().nonnegative(),
  trackingExpiresAt: z.number().int().nonnegative(), originalHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable() }).strict();
export type TestnetLpContext = z.infer<typeof schema>;
// One process only. Every mutation is persisted before returning; no signer material is stored.
export class TestnetLpWalletStore {
  private readonly entries = new Map<string,TestnetLpContext>();
  constructor(private readonly directory?: string, private readonly now = Date.now, private readonly capacity = 128) {
    lpAssert(Number.isInteger(capacity) && capacity > 0 && capacity <= 128,"TESTNET_LP_CONTEXT_INVALID");
    if (!directory) return;
    try {
      mkdirSync(directory,{ recursive:true,mode:0o700 });
      const stat = lstatSync(directory); lpAssert(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,"TESTNET_LP_STORAGE_UNAVAILABLE");
      const names = readdirSync(directory); lpAssert(names.length <= 256,"TESTNET_LP_STORAGE_UNAVAILABLE");
      for (const name of names) {
        lpAssert(/^[a-f0-9]{48}\.json$/.test(name),"TESTNET_LP_STORAGE_UNAVAILABLE");
        const file = join(directory,name), s = lstatSync(file);
        lpAssert(s.isFile() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o600 && s.size <= 32768,"TESTNET_LP_STORAGE_UNAVAILABLE");
        const entry = schema.parse(JSON.parse(readFileSync(file,"utf8")));
        lpAssert(entry.study.contextId === name.slice(0,48) && entry.study.status === "prepared"
          && entry.trackingExpiresAt === entry.issuedAt + 86400000 && entry.issuedAt <= this.now() + 10000
          && (entry.originalHash === null || BigInt(entry.originalHash) > 0n),"TESTNET_LP_STORAGE_UNAVAILABLE");
        // Revalidate originally reviewed calldata at issuance, including expired reviews retained for receipt recovery.
        inspectTestnetLpTransaction(entry.study,entry.issuedAt);
        if (entry.trackingExpiresAt <= this.now()) unlinkSync(file);
        else this.entries.set(entry.study.contextId!,entry);
      }
      lpAssert(this.entries.size <= capacity,"TESTNET_LP_CONTEXT_CAPACITY");
    } catch { throw new TestnetLpError("TESTNET_LP_STORAGE_UNAVAILABLE"); }
  }
  private prune() {
    const now = this.now(); lpAssert(Number.isSafeInteger(now) && now >= 0,"TESTNET_LP_CONTEXT_INVALID");
    for (const [id,c] of this.entries) if (c.trackingExpiresAt <= now) {
      try { if (this.directory) unlinkSync(join(this.directory,`${id}.json`)); }
      catch { throw new TestnetLpError("TESTNET_LP_STORAGE_UNAVAILABLE"); }
      this.entries.delete(id);
    }
  }
  private save(id: string,c: TestnetLpContext) {
    if (!this.directory) { this.entries.set(id,structuredClone(c)); return; }
    const temp = join(this.directory,`${id}.${randomBytes(8).toString("hex")}.tmp`); let fd: number|undefined;
    try {
      fd = openSync(temp,"wx",0o600); writeFileSync(fd,JSON.stringify(schema.parse(c))); fsyncSync(fd); closeSync(fd); fd=undefined;
      renameSync(temp,join(this.directory,`${id}.json`)); this.entries.set(id,structuredClone(c));
    } catch { throw new TestnetLpError("TESTNET_LP_STORAGE_UNAVAILABLE"); }
    finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
  }
  issue(study: TestnetLpStudy,state: string): TestnetLpStudy {
    this.prune(); lpAssert(this.entries.size < this.capacity,"TESTNET_LP_CONTEXT_CAPACITY");
    const id = randomBytes(24).toString("hex"), now = this.now();
    const prepared = { ...study,contextId:id }; inspectTestnetLpTransaction(prepared,now);
    const c = schema.parse({ study:prepared,state,issuedAt:now,trackingExpiresAt:now+86400000,originalHash:null });
    this.save(id,c); return structuredClone(c.study);
  }
  read(id: string): TestnetLpContext {
    this.prune(); const c = /^[a-f0-9]{48}$/.test(id) ? this.entries.get(id) : undefined;
    lpAssert(c,"TESTNET_LP_CONTEXT_UNAVAILABLE"); return structuredClone(c);
  }
  bindHash(id: string,hash: string) {
    const c = this.read(id); lpAssert(/^0x[0-9a-fA-F]{64}$/.test(hash) && BigInt(hash) > 0n,"TESTNET_LP_CONTEXT_INVALID");
    lpAssert(c.originalHash === null || c.originalHash === hash.toLowerCase(),"TESTNET_LP_CONTEXT_HASH_CHANGED");
    if (c.originalHash === null) this.save(id,{ ...c,originalHash:hash.toLowerCase() });
  }
}
