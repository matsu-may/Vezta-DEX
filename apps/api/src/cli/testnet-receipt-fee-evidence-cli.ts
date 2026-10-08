import { existsSync } from "node:fs";
import { baseSepolia } from "viem/chains";
import { createTestnetReadClient } from "../infrastructure/rpc/testnet-read-client";
import { parseBaseSepoliaRpcRps } from "../infrastructure/rpc/testnet-rpc-pacer";
import { collectReceiptFeeEvidence } from "../modules/transaction/testnet-receipt-fee-evidence";
const envFile = new URL("../../.env",import.meta.url);
if(existsSync(envFile)) process.loadEnvFile(envFile);
async function run() {
  const args=process.argv.slice(2);
  if(args.length !== 1 || !/^0x[0-9a-fA-F]{64}$/.test(args[0])) throw new Error("Invalid hash argument");
  const signal=AbortSignal.timeout(25000);
  const client=createTestnetReadClient(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",baseSepolia,signal,parseBaseSepoliaRpcRps(process.env.BASE_SEPOLIA_RPC_RPS));
  const result=await collectReceiptFeeEvidence({getChainId:()=>client.getChainId(),
    getReceipt:hash=>client.request({method:"eth_getTransactionReceipt",params:[hash]}),
    getTransaction:hash=>client.request({method:"eth_getTransactionByHash",params:[hash]}),
    getBlockHash:async number=>(await client.getBlock({blockNumber:number})).hash,
  },{chainId:84532,hash:args[0]});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
void run().catch(()=>{process.stdout.write('{"status":"testnet-receipt-fee-evidence-unavailable","code":"TESTNET_FEE_EVIDENCE_UNAVAILABLE","executionEnabled":false}\n');process.exitCode=1;});
