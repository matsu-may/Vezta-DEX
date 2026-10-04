// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { depthFixture } from "../../../packages/core/src/testnet-depth.test-helper";
import { DemoPoolDiscovery } from "./demo-pool-discovery";

function curated(now = Date.now()) {
  const report = depthFixture(now);
  report.candidateFeeTiers = [3000];
  report.pools[0].feeTier = 3000;
  report.pools[0].address = "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad";
  return report;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("curated desktop discovery", () => {
  it("requires an explicit read and shows the pinned pool with provenance and workflow links", async () => {
    const fetcher = vi.fn(async () => Response.json({ depth: curated() }));
    const wallet = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubGlobal("ethereum", { request: wallet });
    render(<DemoPoolDiscovery />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Depth screen passed");
    expect(screen.getByText("123")).toBeTruthy();
    expect(screen.getByText("base-sepolia-rpc")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View pool detail" }).getAttribute("href")).toBe("/demo/4");
    expect(screen.getByRole("link", { name: "Swap USDC / WETH" }).getAttribute("href")).toBe("/demo/1");
    expect(screen.getByRole("link", { name: "Manage liquidity" }).getAttribute("href")).toBe("/demo/2");
    expect(screen.getByText("USD TVL and APR are unavailable on testnet.")).toBeTruthy();
    expect(wallet).not.toHaveBeenCalled();
  });

  it("never qualifies another fee tier or another address as the executable pool", async () => {
    const report = curated(); report.pools[0].address = "0x1111111111111111111111111111111111111111";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: report })));
    render(<DemoPoolDiscovery detail />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Curated pool not found");
    expect(screen.queryByRole("link", { name: "Swap USDC / WETH" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
  });

  it("expires successful snapshots and removes action links until an explicit refresh", async () => {
    vi.useFakeTimers(); const now = Date.now(); vi.setSystemTime(now);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: curated(now) })));
    render(<DemoPoolDiscovery detail />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" })); });
    expect(screen.getByRole("link", { name: "Manage liquidity" })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(screen.getByText("Snapshot expired · refresh required")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.getByText("123")).toBeTruthy();
  });

  it("clears previous qualification on a failed refresh without exposing provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ depth: curated() }))
      .mockRejectedValueOnce(new Error("private RPC secret")));
    render(<DemoPoolDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" })); await screen.findByText("Depth screen passed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" })); await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).not.toContain("secret");
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.queryByText("Depth screen passed")).toBeNull();
  });
});
