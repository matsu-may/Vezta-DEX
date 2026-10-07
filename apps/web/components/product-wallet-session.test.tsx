// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DemoWalletHeader,DemoWalletProvider} from './demo-wallet-header';
import {TestnetWalletPanel} from './testnet-wallet-panel';
import {TestnetLpWalletPanel} from './testnet-lp-wallet-panel';
const owner='0x1111111111111111111111111111111111111111';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it('revalidates an authorized signer across swap, LP list and detail without new permission prompts or API reads',async()=>{
 HTMLDialogElement.prototype.showModal ??= function(){};HTMLDialogElement.prototype.close ??= function(){};
 vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.setAttribute('open','');});
 vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.removeAttribute('open');});
 vi.stubGlobal('navigator',{locks:{request:async(_name:string,_options:unknown,fn:(lock:object)=>Promise<void>)=>fn({})}});
 const methods:string[]=[];const request=vi.fn(async({method}:{method:string})=>{methods.push(method);return method==='eth_chainId'?'0x14a34':method==='eth_getCode'?'0x':[owner];});
 vi.stubGlobal('ethereum',{isMetaMask:true,request});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const ui=(view:'swap'|'list'|'detail')=><DemoWalletProvider><DemoWalletHeader/>{view==='swap'?<TestnetWalletPanel executionEnabled={false} presentation="demo"/>:<TestnetLpWalletPanel key={view} executionEnabled={false} presentation="demo" productMode={view} selectedTokenId={view==='detail'?'42':undefined} initialOwner={view==='detail'?'0x2222222222222222222222222222222222222222':undefined}/>}</DemoWalletProvider>;
 const tree=render(ui('swap'));await screen.findAllByRole('button',{name:'Connect wallet'});
 expect(methods).toHaveLength(0);fireEvent.click(screen.getAllByRole('button',{name:'Connect wallet'})[0]);fireEvent.click(screen.getByRole('button',{name:/MetaMask/}));
 await screen.findByRole('button',{name:'Wallet 0x1111…1111'});
 tree.rerender(ui('list'));await screen.findByRole('button',{name:'Use connected wallet'});expect(screen.getByRole('button',{name:'Wallet 0x1111…1111'})).toBeTruthy();
 tree.rerender(ui('detail'));await screen.findByRole('button',{name:'Use connected wallet'});expect((screen.getByLabelText('Position owner address') as HTMLInputElement).value).toBe('0x2222222222222222222222222222222222222222');
 expect(methods.filter(m=>m==='eth_requestAccounts')).toHaveLength(1);expect(methods).not.toContain('eth_sendTransaction');expect(fetcher).not.toHaveBeenCalled();
});
