// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TestnetLpWalletPanel } from "./testnet-lp-wallet-panel";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });
it("never prompts on load and shows all independent LP choices in read-only development", async () => {
  const request = vi.fn(async () => []); Object.defineProperty(window, "ethereum", { value: { request }, configurable: true });
  render(<TestnetLpWalletPanel executionEnabled={false} />);
  await screen.findByRole("button", { name: "Connect Base Sepolia wallet" }); expect(request).not.toHaveBeenCalled();
  expect(screen.getByText(/Read-only preview/)).toBeTruthy();
  for (const label of ["Create full-range position", "Add liquidity", "Remove liquidity", "Collect tokens", "Close empty position"]) expect(screen.getByRole("option", { name: label })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("LP action"), { target: { value: "decrease" } });
  expect(screen.getByLabelText("Remove percentage")).toBeTruthy(); expect(screen.getByLabelText("Position NFT ID")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Study LP action" }).hasAttribute("disabled")).toBe(true);
});
it.each([false, true])("shows spender, authorization and fee model before LP approval (dynamic=%s)", async dynamic => {
  const { lpWalletFixture, LP_NOW } = await import("../lib/testnet-lp-wallet.test-helper"); const f = lpWalletFixture("approve");
  if (dynamic) { const fees = { feeModel: "eip1559", maxFeePerGas: f.study.transaction!.gasPrice, maxPriorityFeePerGas: "1000000" }; Object.assign(f.study.transaction!, fees); Object.assign(f.study.gas!, fees); }
  vi.spyOn(Date,"now").mockReturnValue(LP_NOW);
  Object.defineProperty(window,"ethereum",{configurable:true,value:{async request({method}:{method:string}){if(method==="eth_accounts"||method==="eth_requestAccounts")return[f.intent.wallet];if(method==="eth_chainId")return"0x14a34";if(method==="eth_getCode")return"0x";throw Error("unexpected");}}});
  vi.stubGlobal("navigator",{locks:{request:async(_key:unknown,_options:unknown,fn:(lock:unknown)=>Promise<void>)=>fn({})}});
  vi.stubGlobal("fetch",async()=>Response.json({study:f.study}));render(<TestnetLpWalletPanel executionEnabled={true}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Connect Base Sepolia wallet"}));await screen.findByText(`Connected: ${f.intent.wallet}`);
  fireEvent.click(screen.getByRole("button",{name:"Study LP action"}));await screen.findByRole("heading",{name:"Review approve USDC"});
  for(const label of ["Approval spender","Authorization in this action","Transaction target","Prepared nonce","Gas limit","Fee model",dynamic ? "Maximum fee per gas" : "Gas price","L1 fee upper bound","Operator fee upper bound","Native gas balance"])expect(screen.getByText(label)).toBeTruthy();
  if (dynamic) { expect(screen.getByText("EIP-1559")).toBeTruthy(); expect(screen.getByText("Maximum priority fee per gas")).toBeTruthy(); expect(screen.queryByText("Gas price")).toBeNull(); }
});
it("does not claim an authorization after a reverted approval receipt", async () => {
  const {lpWalletFixture,LP_NOW,LP_HASH}=await import("../lib/testnet-lp-wallet.test-helper");const f=lpWalletFixture("approve");vi.spyOn(Date,"now").mockReturnValue(LP_NOW);
  Object.defineProperty(window,"ethereum",{configurable:true,value:{async request({method}:{method:string}){if(method==="eth_accounts"||method==="eth_requestAccounts")return[f.intent.wallet];if(method==="eth_chainId")return"0x14a34";if(method==="eth_getCode")return"0x";if(method==="eth_sendTransaction")return LP_HASH;throw Error("unexpected");}}});
  vi.stubGlobal("navigator",{locks:{request:async(_key:unknown,_options:unknown,fn:(lock:unknown)=>Promise<void>)=>fn({})}});
  vi.stubGlobal("fetch",async(url:string)=>Response.json(url.endsWith("receipt")?{observation:{...f.observation,status:"reverted"}}:{study:f.study}));render(<TestnetLpWalletPanel executionEnabled={true}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Connect Base Sepolia wallet"}));await screen.findByText(`Connected: ${f.intent.wallet}`);fireEvent.click(screen.getByRole("button",{name:"Study LP action"}));await screen.findByRole("heading",{name:"Review approve USDC"});
  fireEvent.click(screen.getByRole("button",{name:"Submit reviewed LP transaction"}));fireEvent.click(await screen.findByRole("button",{name:"Check original LP transaction"}));await screen.findByText("Original transaction reverted. The result is verified.");
  expect(screen.queryByText("Verified authorization")).toBeNull();expect(screen.getByRole("button",{name:"Acknowledge verified LP result"})).toBeTruthy();
});
