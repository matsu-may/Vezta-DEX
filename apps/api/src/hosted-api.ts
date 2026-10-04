import { timingSafeEqual } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { readHostedConfig, type HostedEnv } from "@vezta-dex/core";

const json = (code: string, status: number) => Response.json({ error: "Hosted API request unavailable", code },
  { status, headers: { "Cache-Control": "no-store" } });
const paths = new Set(["depth", "quote", "state", "approval", "prepare", "recheck", "receipt", "historical-approval",
  "lp/positions", "lp/study", "lp/recheck", "lp/receipt"].map(p => `/api/v1/testnet/base-sepolia/${p}`));

/** Admission is shared by every request in this one API process. */
export function createHostedAdmission(env: HostedEnv, now = Date.now): (request: Request) => Response | (() => void) {
  const config = readHostedConfig(env);
  let active = 0;
  const normal: number[] = [], receipts: number[] = [];
  return request => {
    if (!config) return () => {};
    const credential = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (credential.length !== expected.length || !timingSafeEqual(credential, expected)) return json("HOSTED_AUTH_REQUIRED", 401);
    const url = new URL(request.url), path = url.pathname;
    if ((!paths.has(path) && path !== "/readyz") || url.search) return json("HOSTED_ROUTE_UNAVAILABLE", 404);
    if (!config.writesEnabled && ["/api/v1/testnet/base-sepolia/recheck", "/api/v1/testnet/base-sepolia/lp/recheck"].includes(path)) {
      return json("HOSTED_WRITES_DISABLED", 403);
    }
    const budget = path.endsWith("/receipt") ? receipts : normal, cap = budget === receipts ? 120 : 60;
    const time = now(); while (budget.length && time - budget[0] >= 60000) budget.shift();
    if (active >= 2 || budget.length >= cap) return json("HOSTED_API_BUSY", 429);
    budget.push(time); active++;
    let released = false;
    return () => { if (!released) { active--; released = true; } };
  };
}

export function contextDirectories(env: HostedEnv, localRoot: string) {
  if (!readHostedConfig(env)) return { swap: join(localRoot, "testnet-wallet-contexts"), lp: join(localRoot, "testnet-lp-wallet-contexts") };
  const root = env.DEX_CONTEXT_DIR;
  if (!root || !isAbsolute(root) || root === "/" || normalize(root) !== root
    || /^\/(?:tmp|var\/tmp|private\/tmp)(?:\/|$)/.test(root)) throw new Error("HOSTED_STORAGE_INVALID");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("HOSTED_STORAGE_INVALID");
  return { swap: join(root, "swap"), lp: join(root, "lp") };
}
