import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHostedAdmission, contextDirectories } from "./hosted-api";
import { requirePrivateApiHost } from "./api-binding";
import { testnetHttpExecutionEnabled } from "./testnet-execution-gate";
const env = { NODE_ENV: "production", DEX_HOSTED_MODE: "1", DEX_PUBLIC_ORIGIN: "https://dex.example.com",
  DEX_API_URL: "https://api.example.com", DEX_BFF_TOKEN: "ab".repeat(32) };
const req = (path: string, token = env.DEX_BFF_TOKEN) => new Request(`http://api:3021${path}`, { headers: { authorization: `Bearer ${token}` } });
const base = "/api/v1/testnet/base-sepolia/";
it("authenticates before dispatch and isolates hosted endpoints from Polygon", () => {
  const guard = createHostedAdmission(env);
  expect((guard(req(base + "quote", "bad")) as Response).status).toBe(401);
  expect((guard(req("/api/v1/swap-preparation")) as Response).status).toBe(404);
  expect((guard(req(base + "recheck")) as Response).status).toBe(403);
  for (const path of [base + "quote", base + "receipt", base + "lp/receipt", "/readyz"]) {
    const release = guard(req(path)); expect(typeof release).toBe("function"); if (typeof release === "function") release();
  }
});
it("bounds aggregate active requests and independent receipt budget without trusting forwarded IP", () => {
  let now = 1000; const guard = createHostedAdmission({ ...env, DEX_HOSTED_WRITES_ENABLED: "1" }, () => now);
  const first = guard(req(base + "quote")), second = guard(req(base + "quote"));
  expect((guard(req(base + "quote")) as Response).status).toBe(429);
  if (typeof first === "function") first(); if (typeof second === "function") second();
  for (let n = 2; n < 60; n++) { const release = guard(req(base + "quote")); expect(typeof release).toBe("function"); if (typeof release === "function") release(); }
  expect((guard(req(base + "quote")) as Response).status).toBe(429);
  const receipt = guard(req(base + "receipt")); expect(typeof receipt).toBe("function"); if (typeof receipt === "function") receipt();
  now += 60000; const next = guard(req(base + "recheck")); expect(typeof next).toBe("function"); if (typeof next === "function") next();
});
it("permits container binding and HTTP execution only with complete explicit hosted opt-in", () => {
  expect(() => requirePrivateApiHost("0.0.0.0")).toThrow();
  expect(requirePrivateApiHost("0.0.0.0", env)).toBe("0.0.0.0");
  expect(testnetHttpExecutionEnabled(env, "0.0.0.0", 3021)).toBe(false);
  expect(testnetHttpExecutionEnabled({ ...env, DEX_HOSTED_WRITES_ENABLED: "1" }, "0.0.0.0", 3021)).toBe(true);
});
it("requires a private durable root and rejects symlinked roots without fallback", () => {
  expect(() => contextDirectories(env, "/local")).toThrow();
  for (const root of ["/", "relative", "/tmp/data", "/var/tmp/data"]) expect(() => contextDirectories({ ...env, DEX_CONTEXT_DIR: root }, "/local")).toThrow();
  const privateRoot = fileURLToPath(new URL("../../../../../.local-evidence/", import.meta.url));
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(privateRoot, "dex-hosted-"));
  try {
    expect(contextDirectories({ ...env, DEX_CONTEXT_DIR: root }, "/local")).toEqual({ swap: join(root, "swap"), lp: join(root, "lp") });
    const link = `${root}-link`; symlinkSync(root, link);
    try { expect(() => contextDirectories({ ...env, DEX_CONTEXT_DIR: link }, "/local")).toThrow(); } finally { rmSync(link); }
  } finally { rmSync(root, { recursive: true }); }
  expect(contextDirectories({}, "/local")).toEqual({ swap: "/local/testnet-wallet-contexts", lp: "/local/testnet-lp-wallet-contexts" });
});
