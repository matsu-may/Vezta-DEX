import { describe, expect, it } from "vitest";
import { readSubmission, saveSubmission, SUBMISSION_KEY } from "./rehearsal-storage";
import { testIntent, testHash, testNow } from "./rehearsal-fixtures.test-helper";
function storage() { const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}}; }
const marker={kind:"swap" as const,intent:testIntent,hash:null,dataHash:testHash,minimumAmountOut:"995",submittedAt:testNow};
describe("submission recovery",()=>{
  it("persists uncertainty without any signature, calldata or quote",()=>{
    const s=storage();saveSubmission(s,marker);expect(readSubmission(s)).toEqual({kind:"record",record:marker});
    expect(Object.keys(JSON.parse(s.getItem(SUBMISSION_KEY)!)).sort()).toEqual(["dataHash","hash","intent","kind","minimumAmountOut","submittedAt"]);
  });
  it("fails closed on malformed, excessive or secret-bearing stored metadata",()=>{
    const s=storage();
    for(const raw of ["bad",JSON.stringify({...marker,signature:"secret"}),JSON.stringify({...marker,intent:{...testIntent,chainId:1}}),JSON.stringify({...marker,minimumAmountOut:"0"}),JSON.stringify({...marker,intent:{...testIntent,amountIn:"1000001"}})]) {
      s.setItem(SUBMISSION_KEY,raw);expect(readSubmission(s).kind).toBe("invalid");
    }
  });
  it("returns unavailable when storage cannot be read rather than treating it as empty",()=>{
    expect(readSubmission({getItem:()=>{throw new Error("denied");}}).kind).toBe("invalid");
  });
});
