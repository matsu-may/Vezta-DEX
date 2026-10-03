import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetHistoricalApprovalReader, TestnetHistoricalApprovalError } from "./testnet-historical-approval";
const envFile=new URL("../.env",import.meta.url);
if(existsSync(envFile))process.loadEnvFile(envFile);
const reader=new TestnetHistoricalApprovalReader(signal=>createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL??"https://sepolia.base.org",signal));
void reader.read({wallet:process.env.DEX_SMOKE_WALLET,hash:process.env.DEX_SMOKE_HASH}).then(reconciliation=>{
  process.stdout.write(`${JSON.stringify({status:"read-only-historical-approval",reconciliation})}\n`);
}).catch(error=>{
  process.stdout.write(`${JSON.stringify({status:"historical-approval-unavailable",code:error instanceof TestnetHistoricalApprovalError?error.code:"TESTNET_HISTORICAL_RPC_UNAVAILABLE"})}\n`);process.exitCode=1;
});
