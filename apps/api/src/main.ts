import { createServer } from "node:http";
import { existsSync } from "node:fs";
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

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
const port = Number(process.env.PORT ?? "3021");
const host = requirePrivateApiHost(process.env.HOST ?? "127.0.0.1");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

const source = createPolygonPoolSource(rpcUrl);
const reader = new PoolReader(source);
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
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    let body: string | undefined;
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4_096) {
          response.writeHead(413, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ error: "Request too large" }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const result = await handleRequest(new Request(url, { method: request.method, body }), reader, quotes, trading, approval, permits, swaps, wallet, observations, positions);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: "DEX API request failed" }));
  }
}).listen(port, host, () => {
  process.stdout.write(`DEX API listening on http://${host}:${port}\n`);
});
