import { it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { testnetChainConfig, parseTestnetSwapAmount } from "@vezta-dex/core";
import { TestnetWalletPanel } from "./testnet-wallet-panel";
import { TestnetLpWalletPanel } from "../../liquidity/components/testnet-lp-wallet-panel";
import { testnetAmount } from "./testnet-wallet-review";
it("renders selected chain without Base identities and formats chain-qualified USDC",()=>{
 const c=testnetChainConfig(1301);
 expect(testnetAmount("1000000",c.candidate.USDC.address,1301)).toBe("1 USDC");
 expect(parseTestnetSwapAmount("1",c.candidate.USDC.address,1301)).toBe("1000000");
 expect(()=>parseTestnetSwapAmount("1",testnetChainConfig(84532).candidate.USDC.address,1301)).toThrow();
 const swap=renderToStaticMarkup(<TestnetWalletPanel chainId={1301} executionEnabled={false}/>);
 const lp=renderToStaticMarkup(<TestnetLpWalletPanel chainId={1301} executionEnabled={false}/>);
 expect(swap).toContain("Unichain Sepolia"); expect(lp).toContain("Unichain Sepolia");
 expect(swap+lp).not.toContain("Base Sepolia"); expect(swap).not.toContain("Compare direct pools");
});
