// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TestnetActivity } from "./testnet-activity";
import { saveTestnetActivity } from "../lib/testnet-activity";
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
it("shows account-scoped local history and never labels L2-only gas cost as complete fees", async () => {
  const account = "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e";
  saveTestnetActivity(localStorage, { chainId: 84532, account, flow: "swap", kind: "swap", status: "confirmed", hash: `0x${"11".repeat(32)}`, observedAt: "2026-10-04T00:00:00.000Z", l2GasCost: "1000000000", gasPayer: "0x1111111111111111111111111111111111111111" });
  render(<TestnetActivity account={account} />);
  expect(screen.getByText("Local activity")).toBeTruthy();
  expect(await screen.findByText(/L2 gas cost/)).toBeTruthy();
  expect(screen.getByText(/L1\/operator fees are not included/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Original transaction/ }).getAttribute("href")).toContain("https://sepolia.basescan.org/tx/0x");
});
it("isolates blocked browser storage and hides the previous account immediately", async () => {
  const account = "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e";
  saveTestnetActivity(localStorage, { chainId: 84532, account, flow: "swap", kind: "approve", status: "pending", hash: `0x${"11".repeat(32)}`, observedAt: "2026-10-04T00:00:00.000Z" });
  const view = render(<TestnetActivity account={account} />);
  await screen.findByRole("link", { name: /Original transaction/ });
  view.rerender(<TestnetActivity account="0x1111111111111111111111111111111111111111" />);
  expect(screen.queryByRole("link", { name: /Original transaction/ })).toBeNull();
  view.unmount();
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked storage"); });
  render(<TestnetActivity account={account} />);
  expect((await screen.findByRole("status")).textContent).toContain("Local activity storage is unavailable");
});
