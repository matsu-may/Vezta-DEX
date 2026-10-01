import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createPolygonPoolSource } from "./chain";
import { PoolReader } from "./pools";
import { handleRequest } from "./server";
import { QuoteReader } from "./quote";
import { TradingApiQuoteReader } from "./trading-api";
import { TradingApiClient } from "./trading-client";
import { AllowanceReader } from "./allowance-reader";
import { QuoteStore } from "./quote-store";
import { PermitReader } from "./permit-reader";
import { SwapPreparer } from "./swap-preparation";

import { WalletStateReader } from "./wallet-state";
import { WalletObservationReader } from "./wallet-observation";
import { LpPositionReader } from "./lp-position";
import { requirePrivateApiHost } from "./api-binding";
import { ReadinessReader } from "./readiness";
import { formatRequestLog } from "./request-log";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
const port = Number(process.env.PORT ?? "3021");
const host = requirePrivateApiHost(process.env.HOST ?? "127.0.0.1");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

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
createServer(async (request, response) => {
  const requestId = randomUUID();
  const started = performance.now();
  let status = 500;
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
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
    const result = await handleRequest(new Request(url, { method: request.method, body }), reader, quotes, trading, approval, permits, swaps, wallet, observations, positions, readiness);
    const resultBody = Buffer.from(await result.arrayBuffer());
    status = result.status;
    response.writeHead(status, { ...Object.fromEntries(result.headers), "X-Request-Id": requestId });
    response.end(resultBody);
  } catch {
    status = 500;
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": requestId });
    response.end(JSON.stringify({ error: "DEX API request failed" }));
  } finally {
    process.stdout.write(formatRequestLog({ requestId, method: request.method, url: request.url,
      status, durationMs: performance.now() - started }) + "\n");
  }
}).listen(port, host, () => {
  process.stdout.write(`DEX API listening on http://${host}:${port}\n`);
});
