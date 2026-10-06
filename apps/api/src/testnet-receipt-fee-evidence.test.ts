import { expect, it } from "vitest";
const hash=`0x${"ab".repeat(32)}`;const blockHash=`0x${"cd".repeat(32)}`;const from=`0x${"11".repeat(20)}`;const to=`0x${"22".repeat(20)}`;
const receipt=()=>({transactionHash:hash,blockHash,blockNumber:"0x7b",from,to,status:"0x1",type:"0x2",gasUsed:"0x5208",effectiveGasPrice:"0x64",l1Fee:"0x5",operatorFee:"0x0"});
async function functions(){const m=await import("./testnet-receipt-fee-evidence").catch(()=>undefined);expect(m?.collectReceiptFeeEvidence).toBeTypeOf("function");return m!;}
function source(r:Record<string,unknown> = receipt(), overrides = {}) {
  return {getChainId:async()=>84532,getReceipt:async()=>r,getTransaction:async()=>({hash,blockHash,blockNumber:"0x7b",chainId:"0x14a34",from,to,type:"0x2"}),getBlockHash:async()=>blockHash,...overrides};
}
it("reports exact observed components but does not claim fee-model or execution qualification",async()=>{
  const m=await functions();const result=await m.collectReceiptFeeEvidence(source(),{chainId:84532,hash});
  expect(result).toMatchObject({chainId:84532,blockNumber:"123",l2GasCost:"2100000",l1Fee:"5",operatorFee:"0",observedComponentSum:"2100005",
    missingComponents:[],actualTotalFeeQualified:false,executionEnabled:false,canonicalAtRead:true,feeModelVerified:false});
});
it("distinguishes missing operator charge from explicit zero and does not add DA footprint as money",async()=>{
  const m=await functions();const r:Record<string,unknown>=receipt();delete r.operatorFee;r.blobGasUsed="0xabcdef";r.daFootprintGasScalar="0xffff";
  const result=await m.collectReceiptFeeEvidence(source(r),{chainId:84532,hash});
  expect(result.operatorFee).toBeNull();expect(result.missingComponents).toEqual(["operatorFee"]);expect(result.observedComponentSum).toBeNull();
  expect(result).not.toHaveProperty("blobGasUsed");expect(result.actualTotalFeeQualified).toBe(false);
});
it("rejects malformed quantities, deposit types, unknown receipt and overflow",async()=>{
  const m=await functions();
  for(const extra of [{gasUsed:"21000"},{l1Fee:"0x00"},{operatorFee:-1},{gasUsed:"0x0"},{gasUsed:`0x${"f".repeat(64)}`,effectiveGasPrice:"0x2"},{type:"0x7e"},{status:"0x2"}])
    await expect(m.collectReceiptFeeEvidence(source({...receipt(),...extra}),{chainId:84532,hash})).rejects.toThrow();
  await expect(m.collectReceiptFeeEvidence(source(undefined,{getReceipt:async()=>null}),{chainId:84532,hash})).rejects.toThrow();
});
it("requires actual chain and exact canonical transaction/receipt identity",async()=>{
  const m=await functions();
  await expect(m.collectReceiptFeeEvidence(source(undefined,{getChainId:async()=>1301}),{chainId:84532,hash})).rejects.toThrow();
  for(const extra of [{blockHash:`0x${"ef".repeat(32)}`},{transactionHash:`0x${"ef".repeat(32)}`},{from:to},{blockNumber:"0x7c"}])
    await expect(m.collectReceiptFeeEvidence(source({...receipt(),...extra}),{chainId:84532,hash})).rejects.toThrow();
  await expect(m.collectReceiptFeeEvidence(source(undefined,{getBlockHash:async()=>`0x${"ef".repeat(32)}`}),{chainId:84532,hash})).rejects.toThrow();
});
it("never accesses RPC for malformed intent and never defaults missing L1 data to zero",async()=>{
  const m=await functions();let calls=0;
  await expect(m.collectReceiptFeeEvidence(source(undefined,{getChainId:async()=>{calls++;return 84532;}}),{chainId:84532,hash:"invalid"})).rejects.toThrow();expect(calls).toBe(0);
  const r:Record<string,unknown>=receipt();delete r.l1Fee;
  const result=await m.collectReceiptFeeEvidence(source(r),{chainId:84532,hash});expect(result.l1Fee).toBeNull();expect(result.missingComponents).toEqual(["l1Fee"]);
});
