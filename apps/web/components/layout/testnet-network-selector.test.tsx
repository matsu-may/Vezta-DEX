// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {TestnetNetworkSelector} from "./testnet-network-selector";
const state=vi.hoisted(()=>({push:vi.fn(),pending:false}));
vi.mock("next/navigation",()=>({usePathname:()=>"/positions/42",useSearchParams:()=>new URLSearchParams(),useRouter:()=>({push:state.push})}));
vi.mock("../../lib/testnet-network-selection",async importOriginal=>({...await importOriginal<object>(),pendingTestnetWorkspaces:()=>state.pending?[{chainId:84532,flow:"swap",href:"/swap"}]:[]}));
beforeEach(()=>{state.pending=false;state.push.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("opens a keyboard accessible supported-network list and routes without a wallet prompt",async()=>{
 const request=vi.fn();vi.stubGlobal("ethereum",{isMetaMask:true,request});
 render(<TestnetNetworkSelector/>);
 const trigger=screen.getByRole("button",{name:/Testnet network/});
 await waitFor(()=>expect(trigger.hasAttribute("disabled")).toBe(false));
 trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowDown"});
 const selected=await screen.findByRole("option",{name:/Base Sepolia/});
 expect(selected.getAttribute("aria-selected")).toBe("true");expect(document.activeElement).toBe(selected);
 fireEvent.keyDown(selected,{key:"Escape"});expect(screen.queryByRole("listbox")).toBeNull();expect(document.activeElement).toBe(trigger);
 fireEvent.click(trigger);fireEvent.click(screen.getByRole("option",{name:/Unichain Sepolia/}));
 expect(state.push).toHaveBeenCalledWith("/positions?network=unichain-sepolia");expect(request).not.toHaveBeenCalled();
});
it("blocks changing workspace while an original transaction needs recovery",async()=>{
 state.pending=true;render(<TestnetNetworkSelector/>);
 const trigger=screen.getByRole("button",{name:/Testnet network/});
 await screen.findByText(/Original transaction needs recovery/);
 expect(trigger.hasAttribute("disabled")).toBe(true);fireEvent.click(trigger);
 expect(screen.queryByRole("listbox")).toBeNull();expect(state.push).not.toHaveBeenCalled();
});
