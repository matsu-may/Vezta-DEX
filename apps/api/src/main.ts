import { createServer } from "node:http";
import { createPolygonPoolSource } from "./chain";
import { PoolReader } from "./pools";
import { handleRequest } from "./server";

const rpcUrl = process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
const port = Number(process.env.PORT ?? "3021");
const host = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

const reader = new PoolReader(createPolygonPoolSource(rpcUrl));
createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const result = await handleRequest(new Request(url, { method: request.method }), reader);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}).listen(port, host, () => {
  process.stdout.write(`DEX API listening on http://${host}:${port}\n`);
});
