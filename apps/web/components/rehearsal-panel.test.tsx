// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RehearsalPanel } from "./rehearsal-panel";
import { RehearsalController } from "../lib/rehearsal-controller";
import { testAccount, testIntent, testNow, testPlan, testQuote, testWalletState, testHash, testBlockHash, testPreparation, testSignature } from "../lib/rehearsal-fixtures.test-helper";
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(testNow);});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("reviews the quote, permit and gas before each separate wallet action",async()=>{
 const signature=await testSignature();const request=vi.fn(async({method}:{method:string})=>method==="eth_chainId"?"0x89":method==="eth_signTypedData_v4"?signature:method==="eth_sendTransaction"?testHash:[testAccount.address]);
 const call=vi.fn(async(action:string)=>{
  if(action==="quote")return{quote:testQuote(),quoteId:"ab".repeat(24)};
  if(action==="state")return{state:testWalletState()};
  if(action==="approval")return{approval:{chainId:137,blockNumber:"123",observedAt:new Date(testNow).toISOString(),currentAllowance:"1000000",plan:{kind:"ready"}}};
  if(action==="permit")return{permitPlan:testPlan()};
  if(action==="prepare"||action==="recheck")return{preparation:testPreparation(signature)};
  return{observation:{chainId:137,hash:testHash,source:"polygon-rpc",observedAt:new Date(testNow).toISOString(),status:"confirmed",receipt:{from:testIntent.swapper,to:testPreparation(signature).transaction.to,blockNumber:"123",blockHash:testBlockHash,confirmations:"2",outcome:"success",gasUsed:"100000",effectiveGasPrice:"30000000000"}},execution:{status:"verified",nonce:"7",amountIn:"1000000",amountOut:"1000",gasCost:"3000000000000000",balances:{USDC:"1000000",WETH:"1000",POL:"999000000000000000"},tokenAllowance:"0",permitAllowance:{amount:"0",expiration:"0",nonce:"8"}}};
 });
 const controller=new RehearsalController({request},{call},{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},()=>testNow);
 render(<RehearsalPanel controller={controller}/>);
 fireEvent.click(screen.getByRole("button",{name:"Connect Polygon wallet"}));await screen.findByRole("button",{name:"Get rehearsal quote"});
 fireEvent.click(screen.getByRole("button",{name:"Get rehearsal quote"}));await screen.findByText("Minimum received");
 expect(request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_signTypedData_v4"}));
 fireEvent.click(screen.getByRole("button",{name:"Review Permit2"}));await screen.findByRole("button",{name:"Sign reviewed Permit2"});
 fireEvent.click(screen.getByRole("button",{name:"Sign reviewed Permit2"}));await screen.findByRole("button",{name:"Prepare and simulate swap"});
 fireEvent.click(screen.getByRole("button",{name:"Prepare and simulate swap"}));await screen.findByText("Estimated gas limit");
 expect(request).not.toHaveBeenCalledWith(expect.objectContaining({method:"eth_sendTransaction"}));
 fireEvent.click(screen.getByRole("button",{name:"Submit reviewed swap"}));await screen.findByRole("link",{name:"View original Polygon transaction"});
 expect(screen.queryByText(signature)).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Check original transaction"}));await screen.findByText("Verified executed output");
 expect(screen.getByText(/This is not irreversible finality/)).toBeTruthy();
 controller.dispose();
});
it("shows recovery state and never starts a wallet prompt on render",async()=>{
 const request=vi.fn();const record={kind:"swap",intent:testIntent,hash:null,dataHash:testHash,minimumAmountOut:"995",submittedAt:testNow};
 const controller=new RehearsalController({request},{call:vi.fn()},{getItem:()=>JSON.stringify(record),setItem:()=>{},removeItem:()=>{}},()=>testNow);
 render(<RehearsalPanel controller={controller}/>);expect(screen.getByLabelText("Original transaction hash")).toBeTruthy();expect(screen.queryByRole("button",{name:"Submit reviewed swap"})).toBeNull();expect(request).not.toHaveBeenCalled();
 await act(async()=>controller.invalidate());expect(screen.getByLabelText("Original transaction hash")).toBeTruthy();controller.dispose();
});
