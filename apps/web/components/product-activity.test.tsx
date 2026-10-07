// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {ProductActivity} from "./product-activity";
import {saveTestnetActivity} from "../lib/testnet-activity";
const owner='0x1111111111111111111111111111111111111111';
vi.mock('./demo-wallet-header',()=>({useProductWalletAccount:()=>owner}));
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
it('filters browser history by wallet, chain and action without remote reads or wallet requests',async()=>{
 const remote=vi.fn();vi.stubGlobal('fetch',remote);
 const entry={account:owner,flow:'lp',kind:'mint',status:'confirmed',observedAt:'2026-10-07T00:00:00.000Z',tokenId:'42'};
 expect(saveTestnetActivity(localStorage,{...entry,chainId:84532,hash:`0x${'11'.repeat(32)}`})).toBe(true);
 expect(saveTestnetActivity(localStorage,{...entry,chainId:1301,tokenId:'99',hash:`0x${'22'.repeat(32)}`})).toBe(true);
 expect(saveTestnetActivity(localStorage,{...entry,chainId:84532,account:'0x2222222222222222222222222222222222222222',tokenId:'77',hash:`0x${'33'.repeat(32)}`})).toBe(true);
 render(<ProductActivity chainId={84532}/>);
 await screen.findByText('NFT #42');expect(screen.queryByText('NFT #99')).toBeNull();expect(screen.queryByText('NFT #77')).toBeNull();
 fireEvent.change(screen.getByLabelText('Filter activity'),{target:{value:'swap'}});
 expect(screen.getByText('No activity recorded for this wallet and network.')).toBeTruthy();
 expect(remote).not.toHaveBeenCalled();
});
