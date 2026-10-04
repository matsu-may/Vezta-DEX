// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixtures from "../lib/fixtures/testnet-wallet-browser.json";
import { DemoWalletHeader, DemoWalletProvider } from "./demo-wallet-header";
import { TestnetWalletPanel } from "./testnet-wallet-panel";
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function fixture(enabled: boolean) {
  const f = fixtures["forward-swap"]; vi.spyOn(Date, "now").mockReturnValue(f.now);
  const methods: string[] = [];
  vi.stubGlobal("ethereum", { isMetaMask: true, async request({ method }: { method: string }) { methods.push(method); return method === "eth_getCode" ? "0x" : method === "eth_chainId" ? "0x14a34" : [f.intent.wallet]; } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { async request(_key: string, _options: unknown, fn: (lock: object) => Promise<void>) { await fn({}); } } });
  const fetcher = vi.fn(async (_url, init) => { const body = JSON.parse(init!.body as string);
    return Response.json(body.kind ? { ...f.checked, study: { ...f.checked.study, executionEnabled: enabled }, action: { ...f.checked.action, executionEnabled: enabled } }
      : { ...f.quote, qualification: { ...f.quote.qualification, executionEnabled: enabled } }); });
  vi.stubGlobal("fetch", fetcher); return { methods, fetcher };
}
it("shows estimate, minimum and full budget before any send; input edits discard review", async () => {
  const f = await fixture(true); render(<TestnetWalletPanel executionEnabled />);
  expect(f.methods).toEqual([]); expect(f.fetcher).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Connect Base Sepolia wallet" }));
  await screen.findByText(/Connected:/);
  fireEvent.click(screen.getByRole("button", { name: "Get wallet quote" }));
  await screen.findByText("Minimum received");
  fireEvent.click(screen.getByRole("button", { name: "Review swap" }));
  await screen.findByText("Complete snapshot fee budget");
  expect(f.methods).not.toContain("eth_sendTransaction");
  expect(screen.getByRole("button", { name: "Submit reviewed testnet transaction" }).hasAttribute("disabled")).toBe(false);
  fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "reverse" } });
  expect(screen.queryByText("Minimum received")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit reviewed testnet transaction" })).toBeNull();
  expect(screen.getByRole("button", { name: "Get wallet quote" }).hasAttribute("disabled")).toBe(false);
});
it("reverses the demo pair explicitly and invalidates the old quote and transaction review", async () => {
  const f = await fixture(true);
  HTMLDialogElement.prototype.showModal ??= function() {}; HTMLDialogElement.prototype.close ??= function() {};
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) { this.removeAttribute("open"); });
  render(<DemoWalletProvider><DemoWalletHeader /><TestnetWalletPanel executionEnabled presentation="demo" /></DemoWalletProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Connect wallet" }));
  expect(f.methods).toEqual([]);
  expect(screen.queryByRole("button", { name: "Connect Base Sepolia wallet" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /MetaMask/ }));
  await screen.findByRole("button", { name: /^Wallet 0x/ });
  fireEvent.click(screen.getByRole("button", { name: "Get wallet quote" }));
  await screen.findByText("Minimum received");
  fireEvent.click(screen.getByRole("button", { name: "Review swap" }));
  await screen.findByText("Complete snapshot fee budget");
  fireEvent.click(screen.getByRole("button", { name: "Reverse token pair" }));
  expect((screen.getByLabelText("Direction") as HTMLSelectElement).value).toBe("reverse");
  expect((screen.getByLabelText("Input amount") as HTMLInputElement).value).toBe("0.0001");
  expect(screen.queryByText("Minimum received")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit reviewed testnet transaction" })).toBeNull();
  expect(f.methods).not.toContain("eth_sendTransaction");
});
it("sends exact custom inputs and rejects excess precision; edits invalidate old review", async () => {
  const f = await fixture(true); render(<TestnetWalletPanel executionEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect Base Sepolia wallet" }));
  await screen.findByText(/Connected:/);
  fireEvent.change(screen.getByLabelText("Input amount"), { target: { value: "1.234567" } });
  fireEvent.change(screen.getByLabelText("Slippage tolerance (%)"), { target: { value: "0.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Get wallet quote" }));
  await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
  expect(JSON.parse(f.fetcher.mock.calls[0][1].body)).toMatchObject({ amountIn: "1234567", slippageBps: 25 });
  fireEvent.change(screen.getByLabelText("Input amount"), { target: { value: "1.0000001" } });
  expect(screen.getByRole("button", { name: "Get wallet quote" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText("Minimum received")).toBeNull();
  expect(f.methods).not.toContain("eth_sendTransaction");
});
it("keeps normal preview gated even if API metadata permits execution", async () => {
  await fixture(true); render(<TestnetWalletPanel executionEnabled={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect Base Sepolia wallet" })); await screen.findByText(/Connected:/);
  fireEvent.click(screen.getByRole("button", { name: "Get wallet quote" })); await screen.findByText("Minimum received");
  fireEvent.click(screen.getByRole("button", { name: "Review swap" })); await screen.findByText("Complete snapshot fee budget");
  expect(screen.getByRole("button", { name: "Submit reviewed testnet transaction" }).hasAttribute("disabled")).toBe(true);
});
it("clears a rejected network switch notice after explicit successful connection", async () => {
  await fixture(true); let reject = true;
  const f = fixtures["forward-swap"];
  vi.stubGlobal("ethereum", { isMetaMask: true, async request({ method }: { method: string }) {
    if (method === "wallet_switchEthereumChain" && reject) throw { code: 4001 };
    return method === "eth_getCode" ? "0x" : method === "eth_chainId" ? "0x14a34" : [f.intent.wallet];
  } });
  render(<TestnetWalletPanel executionEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: "Switch to Base Sepolia" }));
  await screen.findByText(/Network switch rejected/); reject = false;
  fireEvent.click(screen.getByRole("button", { name: "Connect Base Sepolia wallet" }));
  await screen.findByText(/Connected:/);
  expect(screen.queryByText(/Network switch rejected/)).toBeNull();
});
