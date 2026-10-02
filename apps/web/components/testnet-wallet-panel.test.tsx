// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixtures from "../lib/fixtures/testnet-wallet-browser.json";
import { TestnetWalletPanel } from "./testnet-wallet-panel";
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function fixture(enabled: boolean) {
  const f = fixtures["forward-swap"]; vi.spyOn(Date, "now").mockReturnValue(f.now);
  const methods: string[] = [];
  vi.stubGlobal("ethereum", { async request({ method }: { method: string }) { methods.push(method); return method === "eth_getCode" ? "0x" : method === "eth_chainId" ? "0x14a34" : [f.intent.wallet]; } });
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
  vi.stubGlobal("ethereum", { async request({ method }: { method: string }) {
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
