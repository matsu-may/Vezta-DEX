// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemoWalletHeader, DemoWalletProvider, useDemoWalletBinding } from "./demo-wallet-header";
const account = "0x1111111111111111111111111111111111111111";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function mount() {
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) { this.removeAttribute("open"); });
}
it("opens a wallet chooser without requesting permission; only MetaMask selection connects", async () => {
  HTMLDialogElement.prototype.showModal ??= function() {}; HTMLDialogElement.prototype.close ??= function() {}; mount();
  const request = vi.fn(async ({ method }: { method: string }) => method === "eth_chainId" ? "0x14a34" : [account]);
  vi.stubGlobal("ethereum", { isMetaMask: true, request });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(screen.getByRole("dialog", { name: "Connect wallet" })).toBeTruthy(); expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByRole("button", { name: /Wallet 0x1111/ });
  expect(request.mock.calls.map(([arg]) => arg.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_accounts"]);
});
it("keeps rejected connections in the chooser and does not sign or submit", async () => {
  mount(); const request = vi.fn(async () => { throw { code: 4001 }; }); vi.stubGlobal("ethereum", { isMetaMask: true, request });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByText(/Connection rejected/); expect(screen.getByRole("dialog")).toBeTruthy(); expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close wallet dialog" })); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("delegates connection to the active transaction controller and locks recovery", async () => {
  mount(); const connect = vi.fn(async () => ({ account, error: "" }));
  function Bound({ blocked }: { blocked: boolean }) { useDemoWalletBinding({ account: null, busy: false, blocked, connect }); return null; }
  const ui = (blocked: boolean) => <DemoWalletProvider><DemoWalletHeader /><Bound blocked={blocked} /></DemoWalletProvider>;
  const { rerender } = render(ui(false)); fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await waitFor(() => expect(connect).toHaveBeenCalledTimes(1)); rerender(ui(true));
  expect(screen.getByRole("button", { name: "Wallet · tracking" }).hasAttribute("disabled")).toBe(true);
});
it("requires an explicit network switch and another selection after the wrong chain", async () => {
  mount(); let chain = "0x1";
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "wallet_switchEthereumChain") { chain = "0x14a34"; return null; }
    return method === "eth_chainId" ? chain : [account];
  }); vi.stubGlobal("ethereum", { isMetaMask: true, request });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByText(/Select Base Sepolia/); expect(request.mock.calls.map(([arg]) => arg.method)).not.toContain("wallet_switchEthereumChain");
  fireEvent.click(screen.getByRole("button", { name: "Switch to Base Sepolia" })); await screen.findByText(/Base Sepolia selected/);
  fireEvent.click(screen.getByRole("button", { name: /MetaMask/ })); await screen.findByRole("button", { name: /^Wallet 0x/ });
  expect(request.mock.calls.map(([arg]) => arg.method)).not.toContain("eth_sendTransaction");
});
it("selects MetaMask from multiple injected wallets rather than prompting a different provider", async () => {
  mount(); const other = vi.fn(); const metamask = vi.fn(async ({ method }: { method: string }) => method === "eth_chainId" ? "0x14a34" : [account]);
  vi.stubGlobal("ethereum", { request: other, providers: [{ request: other, isMetaMask: false }, { request: metamask, isMetaMask: true }] });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByRole("button", { name: /^Wallet 0x/ }); expect(other).not.toHaveBeenCalled(); expect(metamask).toHaveBeenCalledTimes(3);
});
it("does not restore a stale account after wallet changes during discovery connection", async () => {
  mount(); let resolveChain!: (chain: string) => void; let change!: () => void;
  const request = vi.fn(async ({ method }: { method: string }) => method === "eth_chainId" ? new Promise<string>(resolve => { resolveChain = resolve; }) : [account]);
  vi.stubGlobal("ethereum", { isMetaMask: true, request, on(event: string, listener: () => void) { if (event === "accountsChanged") change = listener; }, removeListener() {} });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await waitFor(() => expect(resolveChain).toBeTruthy()); change(); resolveChain("0x14a34");
  await screen.findByText(/Connection unavailable/); expect(screen.queryByRole("button", { name: /^Wallet 0x/ })).toBeNull();
});
it("resets the chooser when leaving demo routes and allows opening it after return", () => {
  mount(); const ui = (enabled: boolean) => <DemoWalletProvider enabled={enabled}><DemoWalletHeader /></DemoWalletProvider>;
  const { rerender } = render(ui(true)); fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); expect(screen.getByRole("dialog")).toBeTruthy();
  rerender(ui(false)); expect(screen.queryByRole("dialog")).toBeNull(); rerender(ui(true)); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); expect(screen.getByRole("dialog")).toBeTruthy();
});
it("keeps the chooser accessible without MetaMask and never invokes a different sole wallet", async () => {
  mount(); const other = vi.fn(); vi.stubGlobal("ethereum", { isMetaMask: false, request: other });
  render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" })); fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByText(/Install MetaMask/); expect(other).not.toHaveBeenCalled();
});
it("wraps keyboard focus at both ends of the chooser", () => {
  mount(); render(<DemoWalletProvider><DemoWalletHeader /></DemoWalletProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  const chooser = screen.getByRole("dialog"); const first = screen.getByRole("button", { name: "Close wallet dialog" }); const last = screen.getByRole("button", { name: "Switch to Base Sepolia" });
  first.focus(); fireEvent.keyDown(chooser, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(chooser, { key: "Tab" }); expect(document.activeElement).toBe(first);
});
