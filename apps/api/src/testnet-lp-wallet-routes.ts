import { createTestnetLpDomain, type TestnetChainId } from "@vezta-dex/core";
import { TestnetLpError } from "./testnet-lp-position";
import type { TestnetLpWallet } from "./testnet-lp-wallet";
import type { TestnetLpWalletReceiptReader } from "./testnet-lp-wallet-receipt";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function handleTestnetLpWalletRequest<I extends TestnetChainId = 84532>(request:Request,wallet?:TestnetLpWallet<I>,receipts?:TestnetLpWalletReceiptReader<I>,
  executionEnabled=false,unavailableCode="TESTNET_LP_RPC_NOT_CONFIGURED",chainId:I=84532 as I):Promise<Response|undefined>{
  const {testnetLpStudyRequestSchema,testnetLpRecheckRequestSchema,testnetLpReceiptRequestSchema}=createTestnetLpDomain(chainId);
  const prefix=`/api/v1/testnet/${chainId===84532?"base-sepolia":"unichain-sepolia"}/lp/`;
  const url=new URL(request.url),endpoint=url.pathname.slice(prefix.length);
  if(!url.pathname.startsWith(prefix)||!["study","recheck","receipt"].includes(endpoint))return undefined;
  if(request.method!=="POST")return json({error:"POST required"},405);
  if(url.search)return json({error:"Query unsupported"},400);
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return json({error:"JSON required"},415);
  const reader=request.body?.getReader();if(!reader)return json({error:"JSON required"},400);let body:unknown;
  try{
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;
      if(length>4096){await reader.cancel();return json({error:"Request too large"},413);}chunks.push(chunk.value);}
    const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    body=(endpoint==="study"?testnetLpStudyRequestSchema:endpoint==="recheck"?testnetLpRecheckRequestSchema:testnetLpReceiptRequestSchema).parse(value);
  }catch{return json({error:"Invalid LP wallet request",code:"TESTNET_LP_REQUEST_INVALID"},400);}finally{reader.releaseLock();}
  if(!wallet||(endpoint==="receipt"&&!receipts))return json({error:"Testnet LP wallet unavailable",code:unavailableCode},503);
  try{
    if(endpoint==="receipt")return json({observation:{...await receipts!.observe(body),executionEnabled}});
    return json({study:{...await (endpoint==="study"?wallet.study(body):wallet.recheck(body)),executionEnabled}});
  }catch(error){
    const code=error instanceof TestnetLpError?error.code:"TESTNET_LP_RPC_UNAVAILABLE";
    const status=code==="TESTNET_LP_BUSY"?429:code==="TESTNET_LP_CONTEXT_UNAVAILABLE"?410:code==="TESTNET_LP_CONTEXT_HASH_CHANGED"||code==="TESTNET_LP_CONTEXT_ATTEMPTED"?409:503;
    return json({error:"Testnet LP wallet unavailable",code},status);
  }
}
