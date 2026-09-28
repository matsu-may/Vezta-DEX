import { createHash } from "node:crypto";
import { extractStructFields, inspectGitlink } from "./router-provenance.mjs";

// Public-source-only diagnostic: no env, API key, wallet connection, signature or RPC writes.
const routerRevision = "802fe4c18f47300e0f183e2a42e9146ec2ea9fc3";
const sha256 = (source) => createHash("sha256").update(source).digest("hex");

async function read(url, json = false) {
  let response;
  try {
    response = await fetch(url, { headers: { accept: json ? "application/vnd.github+json" : "text/plain", "user-agent": "vezta-dex-source-probe" }, signal: AbortSignal.timeout(12_000) });
  } catch { throw new Error("NETWORK_UNAVAILABLE"); }
  if (!response.ok) throw new Error(response.status === 429 || response.status === 403 ? "SOURCE_RATE_LIMITED" : "SOURCE_HTTP_ERROR");
  if (!response.body) throw new Error("INVALID_SOURCE_RESPONSE");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256_000) { await reader.cancel(); throw new Error("SOURCE_TOO_LARGE"); }
      chunks.push(Buffer.from(value));
    }
    const content = Buffer.concat(chunks).toString("utf8");
    return json ? JSON.parse(content) : content;
  } finally { reader.releaseLock(); }
}

try {
  const gitlink = inspectGitlink(await read(`https://api.github.com/repos/Uniswap/universal-router/contents/lib/v4-periphery?ref=${routerRevision}`, true));
  const lock = await read(`https://raw.githubusercontent.com/Uniswap/universal-router/${routerRevision}/foundry.lock`, true);
  const lockRevision = lock?.["lib/v4-periphery"]?.branch?.rev ?? lock?.["lib/v4-periphery"]?.rev;
  if (!/^[0-9a-f]{40}$/.test(lockRevision ?? "")) throw new Error("INVALID_LOCK_REVISION");
  const source = await read(`https://raw.githubusercontent.com/Uniswap/v4-periphery/${gitlink}/src/interfaces/IV4Router.sol`);
  const dispatcher = await read(`https://raw.githubusercontent.com/Uniswap/universal-router/${routerRevision}/contracts/base/Dispatcher.sol`);
  process.stdout.write(JSON.stringify({
    status: "source-read", routerRevision, gitlinkRevision: gitlink, lockRevision,
    revisionsMatch: gitlink === lockRevision,
    v4SingleInputFields: extractStructFields(source, "ExactInputSingleParams"),
    v4MultiInputFields: extractStructFields(source, "ExactInputParams"),
    v4InterfaceSha256: sha256(source), dispatcherSha256: sha256(dispatcher),
    deployedSourceVerified: false, calldataValidated: false,
  }) + "\n");
} catch (error) {
  const codes = ["NETWORK_UNAVAILABLE", "SOURCE_RATE_LIMITED", "SOURCE_HTTP_ERROR", "INVALID_SOURCE_RESPONSE", "SOURCE_TOO_LARGE", "INVALID_LOCK_REVISION", "INVALID_GITLINK", "INVALID_SOURCE"];
  process.stdout.write(JSON.stringify({ status: "unavailable", code: codes.includes(error?.message) ? error.message : "INVALID_SOURCE_RESPONSE" }) + "\n");
  process.exitCode = 1;
}
