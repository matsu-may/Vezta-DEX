import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
const fixture=()=>JSON.parse(gunzipSync(readFileSync(new URL("../../fixtures/unichain-sepolia-runtime.json.gz",import.meta.url))).toString("utf8")).contracts;
it("qualifies independently rebuilt Unichain runtimes without accepting Base or other pool fees",()=>{
  expect(()=>verifyTestnetRuntimeCodes(1301,fixture())).not.toThrow();
  expect(()=>verifyTestnetRuntimeCodes(84532,fixture())).toThrow();
  expect(()=>verifyTestnetRuntimeCodes(1301,fixture(),500)).toThrow();
  for(let n=0;n<5;n++){
    const f=fixture();f[n].code=f[n].code.slice(0,-2)+"ff";
    expect(()=>verifyTestnetRuntimeCodes(1301,f)).toThrow();
  }
});
