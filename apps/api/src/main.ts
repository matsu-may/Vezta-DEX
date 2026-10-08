import { createTestnetChainApi } from "./http/testnet-chain-api";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createPolygonPoolSource } from "./infrastructure/rpc/chain";
import { PoolReader } from "./modules/discovery/pools";
import { handleRequest } from "./http/server";
import { QuoteReader } from "./modules/swap/quote";
import { TradingApiQuoteReader } from "./modules/swap/trading-api";
import { TradingApiClient } from "./modules/swap/trading-client";
import { AllowanceReader } from "./modules/swap/allowance-reader";
import { QuoteStore } from "./modules/swap/quote-store";
import { PermitReader } from "./modules/swap/permit-reader";
import { SwapPreparer } from "./modules/swap/swap-preparation";

import { WalletStateReader } from "./modules/wallet/wallet-state";
import { WalletObservationReader } from "./modules/wallet/wallet-observation";
import { LpPositionReader } from "./modules/liquidity/lp-position";
import { requirePrivateApiHost } from "./infrastructure/http/api-binding";
import { ReadinessReader } from "./infrastructure/http/readiness";
import { formatRequestLog } from "./infrastructure/http/request-log";
import { createBaseSepoliaPreflightSource } from "./infrastructure/rpc/base-sepolia-source";
import { probeBaseSepoliaDepth } from "./modules/discovery/base-sepolia-depth";
import { TestnetDiscoveryReader } from "./modules/discovery/testnet-discovery";
import { TestnetSwapQuoteReader } from "./modules/swap/testnet-swap-quote";
import { handleTestnetRequest } from "./http/testnet-routes";
import { toApiRequest } from "./infrastructure/http/api-request";
import { TestnetWalletStateReader } from "./modules/wallet/testnet-wallet-state";
import { TestnetApprovalReader } from "./modules/swap/testnet-approval";
import { TestnetSwapPreparer } from "./modules/swap/testnet-swap-preparation";
import { TestnetActionStore, TestnetRechecker } from "./modules/transaction/testnet-action";
import { testnetHttpExecutionEnabled } from "./infrastructure/http/testnet-execution-gate";
import { TestnetLpPositionReader } from "./modules/liquidity/testnet-lp-position";
import { handleTestnetLpRequest } from "./http/testnet-lp-routes";
import { TestnetReceiptReader } from "./modules/transaction/testnet-receipt";
import { TestnetHistoricalApprovalReader } from "./modules/transaction/testnet-historical-approval";
import { handleTestnetHistoricalApprovalRequest } from "./http/testnet-historical-approval-routes";
import { TestnetLpWallet } from "./modules/liquidity/testnet-lp-wallet";
import { TestnetLpWalletStore } from "./modules/liquidity/testnet-lp-wallet-store";
import { TestnetLpWalletReceiptReader } from "./modules/liquidity/testnet-lp-wallet-receipt";
import { handleTestnetLpWalletRequest } from "./http/testnet-lp-wallet-routes";
import { fileURLToPath } from "node:url";
import { contextDirectories, createHostedAdmission } from "./infrastructure/http/hosted-api";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
const port = Number(process.env.PORT ?? "3021");
const host = requirePrivateApiHost(process.env.HOST ?? "127.0.0.1", process.env);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const admit = createHostedAdmission(process.env);
const directories = contextDirectories(process.env, fileURLToPath(new URL("../../../.local-evidence", import.meta.url)));

const source = createPolygonPoolSource(rpcUrl);
const reader = new PoolReader(source);
const readiness = new ReadinessReader(source);
const quotes = new QuoteReader(source);
const wallet = new WalletStateReader(source);
const observations = new WalletObservationReader(source);
const positions = new LpPositionReader(source);
const approval = new AllowanceReader(source);
const quoteStore = new QuoteStore();
const tradingClient = process.env.UNISWAP_API_KEY?.trim() ? new TradingApiClient(process.env.UNISWAP_API_KEY) : undefined;
const trading = tradingClient ? new TradingApiQuoteReader(tradingClient, Date.now, quoteStore) : undefined;
const permits = trading ? new PermitReader(source, quoteStore) : undefined;
const swaps = tradingClient ? new SwapPreparer(source, quoteStore, tradingClient) : undefined;
const testnetRpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const testnetHistoricalApprovals = testnetRpcUrl ? new TestnetHistoricalApprovalReader(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal)) : undefined;
const testnet = testnetRpcUrl ? new TestnetDiscoveryReader(signal =>
  probeBaseSepoliaDepth(createBaseSepoliaPreflightSource(testnetRpcUrl, signal))) : undefined;
const testnetLpPositions = testnetRpcUrl ? new TestnetLpPositionReader(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal)) : undefined;
const testnetQuotes = testnetRpcUrl ? new TestnetSwapQuoteReader(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal)) : undefined;
const testnetStates = testnetRpcUrl ? new TestnetWalletStateReader(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal)) : undefined;
const testnetApprovals = testnetRpcUrl && testnetQuotes ? new TestnetApprovalReader(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal), testnetQuotes.store) : undefined;
const testnetPreparer = testnetRpcUrl && testnetQuotes ? new TestnetSwapPreparer(signal =>
  createBaseSepoliaPreflightSource(testnetRpcUrl, signal), testnetQuotes.store) : undefined;
let testnetContexts: TestnetActionStore | undefined;
let testnetRechecker: TestnetRechecker | undefined;
let testnetReceipts: TestnetReceiptReader | undefined;
if (testnetRpcUrl && testnetQuotes && testnetApprovals && testnetPreparer) {
  try {
    testnetContexts = new TestnetActionStore(Date.now, 128,
      directories.swap);
    testnetRechecker = new TestnetRechecker(testnetApprovals, testnetPreparer, testnetQuotes.store, testnetContexts);
    testnetReceipts = new TestnetReceiptReader(signal => createBaseSepoliaPreflightSource(testnetRpcUrl, signal), testnetContexts);
  } catch {
    testnetContexts = undefined; testnetRechecker = undefined; testnetReceipts = undefined;
    process.stderr.write("TESTNET_CONTEXT_STORAGE_UNAVAILABLE\n");
  }
}
let testnetLpWallet: TestnetLpWallet | undefined;
let testnetLpWalletReceipts: TestnetLpWalletReceiptReader | undefined;
let testnetLpWalletUnavailable = "TESTNET_LP_RPC_NOT_CONFIGURED";
if (testnetRpcUrl) {
  try {
    const lpStore = new TestnetLpWalletStore(directories.lp);
    testnetLpWallet = new TestnetLpWallet(signal => createBaseSepoliaPreflightSource(testnetRpcUrl, signal), lpStore);
    testnetLpWalletReceipts = new TestnetLpWalletReceiptReader(signal => createBaseSepoliaPreflightSource(testnetRpcUrl, signal), lpStore);
  } catch {
    testnetLpWalletUnavailable = "TESTNET_LP_STORAGE_UNAVAILABLE";
    process.stderr.write("TESTNET_LP_STORAGE_UNAVAILABLE\n");
  }
}
const unichain = createTestnetChainApi(1301, process.env.UNICHAIN_SEPOLIA_RPC_URL?.trim(), {
  swap: `${directories.swap}-unichain-sepolia`, lp: `${directories.lp}-unichain-sepolia`,
});
createServer(async (request, response) => {
  const requestId = randomUUID();
  const started = performance.now();
  let status = 500;
  let release: (() => void) | undefined;
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const reply = async (result: Response) => {
      status = result.status;
      response.writeHead(status, { ...Object.fromEntries(result.headers), "X-Request-Id": requestId });
      response.end(Buffer.from(await result.arrayBuffer()));
    };
    if (url.pathname === "/healthz" && request.method === "GET" && !url.search) {
      await reply(Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })); return;
    }
    const authorization = request.headers.authorization;
    const admission = admit(new Request(url, { method: request.method,
      headers: typeof authorization === "string" ? { authorization } : {} }));
    if (admission instanceof Response) { await reply(admission); return; }
    release = admission;
    const storageReady = Boolean(testnetRpcUrl && testnetContexts && testnetLpWallet && testnetLpWalletReceipts);
    if (url.pathname === "/readyz" && request.method === "GET") {
      await reply(Response.json({ status: storageReady ? "ready" : "unavailable" },
        { status: storageReady ? 200 : 503, headers: { "Cache-Control": "no-store" } })); return;
    }
    const executionEnabled = storageReady && testnetHttpExecutionEnabled(process.env, host, port);
    let body: string | undefined;
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4_096) {
          status = 413;
          response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId });
          response.end(JSON.stringify({ error: "Request too large" }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const apiRequest = toApiRequest(url, request.method, body, request.headers);
    const result = await unichain.handle(apiRequest, testnetHttpExecutionEnabled(process.env, host, port)) ?? await handleTestnetHistoricalApprovalRequest(apiRequest, testnetHistoricalApprovals) ?? await handleTestnetLpWalletRequest(apiRequest, testnetLpWallet, testnetLpWalletReceipts, executionEnabled, testnetLpWalletUnavailable) ?? await handleTestnetLpRequest(apiRequest, testnetLpPositions) ?? await handleTestnetRequest(apiRequest, testnet, testnetQuotes, testnetStates, testnetApprovals, testnetPreparer, testnetRechecker, testnetReceipts, executionEnabled)
      ?? await handleRequest(apiRequest, reader, quotes, trading, approval, permits, swaps, wallet, observations, positions, readiness);
    const resultBody = Buffer.from(await result.arrayBuffer());
    status = result.status;
    response.writeHead(status, { ...Object.fromEntries(result.headers), "X-Request-Id": requestId });
    response.end(resultBody);
  } catch {
    status = 500;
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId });
    response.end(JSON.stringify({ error: "DEX API request failed" }));
  } finally {
    release?.();
    process.stdout.write(formatRequestLog({ requestId, method: request.method, url: request.url,
      status, durationMs: performance.now() - started }) + "\n");
  }
}).listen(port, host, () => {
  process.stdout.write(`DEX API listening on http://${host}:${port}\n`);
});
