import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

it("boots the real hosted listener and rejects unauthorized/mainnet/recheck before dispatch", async () => {
  const socket = createServer(); await new Promise<void>(r => socket.listen(0, "127.0.0.1", r));
  const address = socket.address(); if (!address || typeof address === "string") throw Error("port unavailable");
  const port = address.port; await new Promise<void>(r => socket.close(() => r()));
  const privateRoot = fileURLToPath(new URL("../../../../../.local-evidence/", import.meta.url));
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(privateRoot, "dex-hosted-http-")), token = "cd".repeat(32);
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "production", HOST: "0.0.0.0", PORT: String(port), DEX_HOSTED_MODE: "1",
      DEX_API_URL: "https://api.example.com", DEX_PUBLIC_ORIGIN: "https://dex.example.com", DEX_BFF_TOKEN: token,
      DEX_CONTEXT_DIR: directory, DEX_HOSTED_WRITES_ENABLED: "0", BASE_SEPOLIA_RPC_URL: "", UNISWAP_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("hosted startup timed out")), 10000);
      child.stdout.on("data", data => { if (String(data).includes("DEX API listening")) { clearTimeout(timer); resolve(); } });
      child.once("exit", () => { clearTimeout(timer); reject(Error("hosted process exited before ready")); });
    });
    const origin = `http://127.0.0.1:${port}`, headers = { authorization: `Bearer ${token}` };
    expect((await fetch(`${origin}/healthz`)).status).toBe(200);
    expect((await fetch(`${origin}/readyz`)).status).toBe(401);
    expect((await fetch(`${origin}/readyz`, { headers })).status).toBe(503);
    expect((await fetch(`${origin}/api/v1/swap-preparation`, { headers })).status).toBe(404);
    expect((await fetch(`${origin}/api/v1/testnet/base-sepolia/recheck`, { method: "POST", headers, body: "{}" })).status).toBe(403);
    const receipt = await fetch(`${origin}/api/v1/testnet/base-sepolia/receipt`, { method: "POST",
      headers: { ...headers, "content-type": "application/json" }, body: "{}" });
    expect(receipt.status).toBe(400); // Recovery reaches schema validation with writes disabled.
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(r => child.once("exit", () => r()));
    rmSync(directory, { recursive: true });
  }
}, 15000);
