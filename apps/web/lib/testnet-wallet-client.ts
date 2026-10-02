import { safeTestnetCode } from "./testnet-browser-errors";
import { boundedJson } from "./rehearsal-client";
import type { TestnetWalletApi } from "./testnet-wallet-controller";
export class TestnetBrowserError extends Error {
  constructor(readonly status = 503, readonly code = "TESTNET_BROWSER_UNAVAILABLE") { super(code); }
}
export function createTestnetWalletClient(fetcher: typeof fetch = fetch): TestnetWalletApi {
  return { async call(action, body) {
    try {
      if (!["quote", "recheck", "receipt"].includes(action)) throw new TestnetBrowserError(400);
      const response = await fetcher(`/api/testnet-wallet/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(32000) });
      const result = await boundedJson(response, response.ok ? 65536 : 4096);
      if (!response.ok) {
        const code = safeTestnetCode(typeof result === "object" && result !== null && "code" in result ? result.code : undefined);
        throw new TestnetBrowserError(response.status, code);
      }
      return result;
    } catch (error) { if (error instanceof TestnetBrowserError) throw error; throw new TestnetBrowserError(); }
  } };
}
