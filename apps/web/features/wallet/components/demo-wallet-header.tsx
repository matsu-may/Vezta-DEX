"use client";
import {testnetChainConfig, type TestnetChainId} from "@vezta-dex/core";
import Image from "next/image";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {pendingTestnetWorkspaces} from "../../../lib/testnet-network-selection";
import type { TestnetWallet } from "../../swap/lib/testnet-wallet-controller";

type Connection = { account: string | null; error?: string };
type Binding = { account: string | null; busy: boolean; blocked: boolean; connect: () => Promise<Connection> };
type Registry = { chainId: TestnetChainId; enabled: boolean; account: string | null; setAccount: (account: string | null) => void; walletDialogOpen: boolean; setWalletDialogOpen: (open: boolean) => void; binding: Binding | null; register: (id: symbol, value: Binding | null) => void };
const Context = createContext<Registry | null>(null);

// Select the same injected provider for the header and the guarded action controllers.
export function injectedDemoWallet(): TestnetWallet | undefined {
  const injected = (window as unknown as { ethereum?: TestnetWallet & { isMetaMask?: boolean; providers?: (TestnetWallet & { isMetaMask?: boolean })[] } }).ethereum;
  return injected?.providers ? injected.providers.find(wallet => wallet.isMetaMask) : injected?.isMetaMask ? injected : undefined;
}

export function DemoWalletProvider({ children, enabled = true, chainId = 84532 }: { children: ReactNode; enabled?: boolean; chainId?: TestnetChainId }) {
  const [entry, setEntry] = useState<{ id: symbol; value: Binding } | null>(null);
  const [account,setAccount]=useState<string|null>(null);
  const [walletDialogOpen,setWalletDialogOpen]=useState(false);
  const register = useCallback((id: symbol, value: Binding | null) => {
    setEntry(current => value ? { id, value } : current?.id === id ? null : current);
  }, []);
  return <Context.Provider value={{ chainId, enabled, account, setAccount, walletDialogOpen, setWalletDialogOpen, binding: entry?.value ?? null, register }}>{children}</Context.Provider>;
}

export function useProductWalletAccount() { const context=useContext(Context); return context?.binding?.account ?? context?.account ?? null; }
export function useProductWalletSession() { return useContext(Context)?.account ?? null; }
export function useProductWalletDialog() { const context=useContext(Context); return context?.enabled ? () => context.setWalletDialogOpen(true) : undefined; }

export function useDemoWalletBinding(value: Binding, enabled = true) {
  const context = useContext(Context); const id = useRef(Symbol("wallet-panel"));
  const register = context?.register; const active = !!context?.enabled && enabled;
  const { account, busy, blocked, connect } = value;
  useEffect(() => {
    if (!active || !register) return;
    const key = id.current; register(key, { account, busy, blocked, connect });
    return () => register(key, null);
  }, [active, register, account, busy, blocked, connect]);
  return active;
}

export function DemoWalletHeader() {
  const context = useContext(Context);
  return context?.enabled ? <DemoWalletHeaderControl /> : null;
}

function DemoWalletHeaderControl() {
  const context = useContext(Context);
  const config = testnetChainConfig(context?.chainId ?? 84532), chainHex = `0x${config.policy.chainId.toString(16)}`;
  const account=context?.account ?? null, setAccount=context!.setAccount;
  const open=context!.walletDialogOpen, setOpen=context!.setWalletDialogOpen;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(""); const [switching, setSwitching] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId(); const descriptionId = useId(); const alive = useRef(true);
  const generation = useRef(0);
  const active = context?.binding;
  const currentAccount = active ? active.account : account;
  const [pending,setPending]=useState(false);
  useEffect(()=>{const update=()=>{try {setPending(pendingTestnetWorkspaces(window.localStorage).length>0);}catch {setPending(true);}};queueMicrotask(update);const timer=setInterval(update,500);window.addEventListener("storage",update);return()=>{clearInterval(timer);window.removeEventListener("storage",update);};},[]);
  const blocked = !!active?.blocked || pending; const busy = connecting || switching || !!active?.busy;
  useEffect(() => {
    alive.current = true;
    const wallet = injectedDemoWallet(); const clear = () => { generation.current++; setAccount(null); };
    for (const event of ["accountsChanged", "chainChanged", "disconnect"]) wallet?.on?.(event, clear);
    return () => { alive.current = false; setOpen(false); for (const event of ["accountsChanged", "chainChanged", "disconnect"]) wallet?.removeListener?.(event, clear); };
  }, [setAccount, setOpen]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !blocked && !element.open) element.showModal();
    else if ((!open || blocked) && element.open) { element.close(); trigger.current?.focus(); }
  }, [open, blocked]);
  async function connect() {
    if (busy || blocked) return; setError(""); setConnecting(true);
    try {
      let result: Connection;
      if (active) result = await active.connect();
      else {
        const wallet = injectedDemoWallet();
        if (!wallet) { setError("Install MetaMask in this browser, then reload this page."); return; }
        const accounts: unknown = await wallet.request({ method: "eth_requestAccounts" });
        const owner = Array.isArray(accounts) ? accounts[0] : null;
        if (typeof owner !== "string" || !/^0x[\da-f]{40}$/i.test(owner)) throw new Error("No account selected");
        const selectedGeneration = generation.current;
        if (await wallet.request({ method: "eth_chainId" }) !== chainHex) {
          setError(`Select ${config.label} in MetaMask or use the network switch below, then select MetaMask again.`); return;
        }
        const current: unknown = await wallet.request({ method: "eth_accounts" });
        if (selectedGeneration !== generation.current || !Array.isArray(current) || typeof current[0] !== "string" || current[0].toLowerCase() !== owner.toLowerCase()) throw new Error("Wallet changed during connection");
        result = { account: owner };
      }
      if (!alive.current) return;
      if (result.account) { setAccount(result.account); setOpen(false); }
      else setError(result.error || `Connection unavailable. Check the selected wallet and ${config.label} network, then try again.`);
    } catch (cause) {
      if (alive.current) setError((cause as { code?: number })?.code === 4001 ? "Connection rejected. Select MetaMask to try again." : `Connection unavailable. Check MetaMask and the ${config.label} network.`);
    } finally { if (alive.current) setConnecting(false); }
  }
  async function switchChain() {
    if (busy || blocked) return; setSwitching(true); setError("");
    try {
      const wallet = injectedDemoWallet();
      if (!wallet) { setError("Install MetaMask in this browser, then reload this page."); return; }
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      if (alive.current) setError(`${config.label} selected. Select MetaMask to connect.`);
    } catch { if (alive.current) setError(`Network switch rejected or unavailable. Add ${config.label} in MetaMask using the owner guide.`); }
    finally { if (alive.current) setSwitching(false); }
  }
  function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (!context?.enabled) return null;
  const short = currentAccount ? `${currentAccount.slice(0, 6)}…${currentAccount.slice(-4)}` : "";
  return <div className="demo-wallet-header">
    <button ref={trigger} className={`wallet-trigger ${currentAccount ? "wallet-trigger-connected" : ""}`} disabled={busy || blocked}
      aria-label={blocked ? "Wallet · tracking" : currentAccount ? `Wallet ${short}` : "Connect wallet"}
      aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}>
      <span aria-hidden="true" className="wallet-status-dot" />{blocked ? "Wallet · tracking" : currentAccount ? short : "Connect wallet"}
    </button>
    <dialog ref={dialog} className="wallet-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={keepDialogFocus}>
      <div className="wallet-dialog-heading"><h2 id={titleId}>{currentAccount ? "Your wallet" : "Connect wallet"}</h2>
        <button className="wallet-dialog-close" aria-label="Close wallet dialog" onClick={() => setOpen(false)}>×</button></div>
      <p id={descriptionId}>Connect with MetaMask on {config.label}. Test tokens only.</p>
      {currentAccount && <div className="wallet-account"><span>Connected account</span><p className="mono">{currentAccount}</p></div>}
      <button className="wallet-option" disabled={busy || blocked} onClick={() => void connect()}>
        <span className="wallet-option-icon" aria-hidden="true"><Image src="/wallets/metamask.svg" alt="" width={32} height={32} unoptimized /></span><span><strong>MetaMask</strong><small>{connecting ? "Waiting for wallet…" : currentAccount ? "Reconnect or select another account" : "Browser extension"}</small></span><span aria-hidden="true">↗</span>
      </button>
      {error && <p className="wallet-dialog-message" role="status">{error}</p>}
      <button className="wallet-network-switch" disabled={busy || blocked} onClick={() => void switchChain()}>{switching ? "Switching network…" : `Switch to ${config.label}`}</button>
      <p className="wallet-dialog-note">Connecting does not approve tokens or send a transaction.</p>
    </dialog>
  </div>;
}
