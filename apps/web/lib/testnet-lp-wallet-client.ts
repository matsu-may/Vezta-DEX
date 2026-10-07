import { type TestnetChainId } from "@vezta-dex/core";
import { safeTestnetLpCode } from "./testnet-lp-wallet-errors";
import { boundedJson } from "./rehearsal-client";
import { TestnetBrowserError } from "./testnet-wallet-client";
import type { TestnetLpWalletApi } from "./testnet-lp-wallet-controller";
export function createTestnetLpWalletClient(fetcher: typeof fetch = fetch, chainId: TestnetChainId = 84532): TestnetLpWalletApi {
  return { async call(action, body) {
    try {
      if (!["study", "recheck", "receipt"].includes(action)) throw new TestnetBrowserError(400);
      const response = await fetcher(chainId === 84532 ? `/api/testnet-lp/${action}` : `/api/testnet-chains/unichain-sepolia/lp/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(32000) });
      const raw = await boundedJson(response, response.ok ? 65536 : 4096);
      if (!response.ok) throw new TestnetBrowserError(response.status, safeTestnetLpCode(typeof raw === "object" && raw !== null && "code" in raw ? raw.code : undefined));
      return raw;
    } catch (e) { if (e instanceof TestnetBrowserError) throw e; throw new TestnetBrowserError(); }
  } };
}
