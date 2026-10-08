// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TestnetLpWalletPanel } from "./testnet-lp-wallet-panel";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it("opens the create wizard without wallet prompts and requires selecting its supported pool",async()=>{
  const request=vi.fn();vi.stubGlobal("ethereum",{isMetaMask:true,request});
  render(<TestnetLpWalletPanel chainId={1301} executionEnabled={false} presentation="demo" productMode="create"/>);
  expect(screen.getByRole("heading",{name:"Choose a pool"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Select USDC / WETH pool"}));
  expect(screen.getByRole("heading",{name:"Set your position"})).toBeTruthy();
  expect(await screen.findByText(/No historical chart/)).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});
it('shows only the selected NFT and distinguishes an unscanned ID from a missing completed scan',async()=>{
 const {TestnetLpPanel}=await import('./testnet-lp-panel');
 const {lpBrowserPage}=await import('../fixtures/testnet-lp-browser');
 vi.spyOn(Date,'now').mockReturnValue(Date.parse(lpBrowserPage.snapshot.observedAt)+2000);
 let incomplete=true;
 vi.stubGlobal('fetch',async()=>Response.json({page:{...lpBrowserPage,totalOwned:incomplete?'2':'1',nextCursor:incomplete?'1':null,incomplete}}));
 render(<TestnetLpPanel productMode="detail" selectedTokenId="99"/>);
 fireEvent.change(screen.getByLabelText('Position owner address'),{target:{value:lpBrowserPage.owner}});
 fireEvent.click(screen.getByRole('button',{name:'Read LP positions'}));
 await screen.findByText(/Position not scanned yet/);
 expect(screen.queryByText('Position #42')).toBeNull();
 incomplete=false;fireEvent.click(screen.getByRole('button',{name:'Read LP positions'}));
 await screen.findByText(/This scan did not find the selected NFT/);
 vi.restoreAllMocks();
});
it('carries the queried owner into a detail link separately from the connected signer',async()=>{
 const {TestnetLpPanel}=await import('./testnet-lp-panel');const {lpBrowserPage}=await import('../fixtures/testnet-lp-browser');
 vi.spyOn(Date,'now').mockReturnValue(Date.parse(lpBrowserPage.snapshot.observedAt)+2000);
 vi.stubGlobal('fetch',async()=>Response.json({page:lpBrowserPage}));
 const view=render(<TestnetLpPanel productMode="list" connectedWallet="0x1111111111111111111111111111111111111111"/>);
 fireEvent.change(screen.getByLabelText('Position owner address'),{target:{value:lpBrowserPage.owner}});fireEvent.click(screen.getByRole('button',{name:'Read LP positions'}));
 const link=await screen.findByRole('link',{name:'View position →'});expect(link.getAttribute('href')).toContain(`?owner=${lpBrowserPage.owner}`);
 view.unmount();render(<TestnetLpPanel productMode="detail" selectedTokenId="42" initialOwner={lpBrowserPage.owner}/>);
 expect((screen.getByLabelText('Position owner address') as HTMLInputElement).value).toBe(lpBrowserPage.owner);
});
