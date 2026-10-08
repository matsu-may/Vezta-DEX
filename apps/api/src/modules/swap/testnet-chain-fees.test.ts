import { expect,it } from "vitest";
import { parseTransaction } from "viem";
import { testnetChainConfig } from "@vezta-dex/core";
import { serializeTestnetFeeEnvelope } from "../transaction/testnet-fees";
it("prices only the explicitly selected chain's reviewed destinations and envelope",()=>{
 const c=testnetChainConfig(1301),tx={chainId:1301 as const,from:"0x1111111111111111111111111111111111111111" as const,to:c.policy.router,data:"0x12345678" as const,value:"0" as const};
 const encoded=serializeTestnetFeeEnvelope(tx,7n,100000n,20000000n);
 expect(parseTransaction(encoded)).toMatchObject({chainId:1301,to:c.policy.router.toLowerCase(),nonce:7,gas:100000n,gasPrice:20000000n});
 expect(()=>serializeTestnetFeeEnvelope({...tx,to:testnetChainConfig(84532).policy.router},7n,100000n,20000000n)).toThrow();
 expect(()=>serializeTestnetFeeEnvelope({...tx,chainId:84532},7n,100000n,20000000n)).toThrow();
});
