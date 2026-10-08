// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../../../packages/core/src/discovery/testnet-depth.test-helper";
import { TestnetDiscovery } from "./testnet-discovery";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("testnet discovery screen", () => {
  it("does not fetch or prompt on load, then shows labeled chain data and selected quote amounts", async () => {
    const fetcher = vi.fn(async () => Response.json({ depth: depthFixture() }));
    const wallet = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubGlobal("ethereum", { request: wallet });
    render(<TestnetDiscovery />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check Base Sepolia pools" }));
    await screen.findByRole("button", { name: "Preview 0.05% pool" });
    expect(screen.getByText("123")).toBeTruthy();
    expect(screen.queryByText("Estimated received")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview 0.05% pool" }));
    expect(screen.getByText("Estimated received")).toBeTruthy();
    const preview = within(screen.getByRole("region", { name: "Selected quote preview" }));
    expect(preview.getByText("0.0000000000000995 WETH")).toBeTruthy();
    expect(preview.getByText("0.000000000000099002 WETH")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quote sample"), { target: { value: "4" } });
    expect(preview.getByText("0.0995 USDC")).toBeTruthy();
    expect(wallet).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /submit|sign|approve/i })).toBeNull();
  });

  it("clears previous results during refresh and after errors, and distinguishes no candidates", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ depth: depthFixture() }))
      .mockRejectedValueOnce(new Error("private RPC key"))
      .mockResolvedValueOnce(Response.json({ depth: { ...depthFixture(), pools: [], candidateFeeTiers: [], depthQualified: false } }));
    vi.stubGlobal("fetch", fetcher); render(<TestnetDiscovery />);
    const button = screen.getByRole("button", { name: "Check Base Sepolia pools" });
    fireEvent.click(button); await screen.findByRole("button", { name: "Preview 0.05% pool" });
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: "Preview 0.05% pool" })).toBeNull();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).not.toContain("private");
    fireEvent.click(button);
    await screen.findByText("No pool passed the demo depth screen.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("expires selected quote previews and prevents duplicate in-flight requests", async () => {
    const now = Date.now();
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fetcher = vi.fn(async () => Response.json({ depth: depthFixture(now) }));
    vi.stubGlobal("fetch", fetcher); render(<TestnetDiscovery />);
    const button = screen.getByRole("button", { name: "Check Base Sepolia pools" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview 0.05% pool" }));
    expect(screen.getByText("Estimated received")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(screen.queryByText("Estimated received")).toBeNull();
    expect(screen.getByText("Snapshot expired. Refresh before previewing a quote.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview 0.05% pool" }).getAttribute("disabled")).not.toBeNull();
  });
});
