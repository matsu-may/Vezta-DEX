// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
function multiple(now = Date.now()) {
  const report = curated(now);
  report.pools = [100, 500, 3000, 10000].map((feeTier, index) => ({
    ...report.pools[0], feeTier,
    address: feeTier === 3000 ? report.pools[0].address : `0x${String(index + 1).repeat(40)}`,
    samples: report.pools[0].samples.map(sample => ({ ...sample })),
  }));
  report.candidateFeeTiers = [100, 500, 3000, 10000];
  return report;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("curated desktop discovery", () => {
  it("links a fresh independently pinned alternate pool to its selected swap, while LP remains pinned", async () => {
    const report = curated(); report.pools[0].feeTier = 500;
    report.pools[0].address = "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0";
    report.candidateFeeTiers = [500];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: report })));
    render(<DemoPoolDiscovery detail selection={{ fee: "500", pool: report.pools[0].address }} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Depth screen passed");
    expect(screen.getByRole("link", { name: "Swap USDC / WETH" }).getAttribute("href")).toBe(`/demo/1?fee=500&pool=${report.pools[0].address}`);
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
  });
  it("requires an explicit read and shows the pinned pool with provenance and workflow links", async () => {
    const fetcher = vi.fn(async () => Response.json({ depth: curated() }));
    const wallet = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubGlobal("ethereum", { request: wallet });
    render(<DemoPoolDiscovery />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Depth screen passed");
    expect(screen.getByText("123")).toBeTruthy();
    expect(screen.getByText("base-sepolia-rpc")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View 0.3% pool detail" }).getAttribute("href")).toBe("/demo/4?fee=3000&pool=0x46880b404CD35c165EDdefF7421019F8dD25F4Ad");
    expect(screen.getByRole("link", { name: "Swap USDC / WETH" }).getAttribute("href")).toBe("/demo/1");
    expect(screen.getByRole("link", { name: "Manage liquidity" }).getAttribute("href")).toBe("/demo/2");
    expect(screen.getByText("USD TVL and APR are unavailable on testnet.")).toBeTruthy();
    expect(wallet).not.toHaveBeenCalled();
  });

  it("lists all observed candidates and defaults selection to the pinned 0.3% pool", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: multiple() })));
    render(<DemoPoolDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    const table = await screen.findByRole("table", { name: "Observed pools" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    const selected = within(table).getAllByRole("row").find(row => row.getAttribute("aria-selected") === "true");
    expect(selected?.textContent).toContain("0.3%");
    expect(within(table).getAllByText("Read-only · unqualified execution")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Manage liquidity" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View 0.05% pool detail" }).getAttribute("href")).toBe("/demo/4?fee=500&pool=0x2222222222222222222222222222222222222222");
  });

  it("selects another observed pool without offering swap or liquidity writes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: multiple() })));
    render(<DemoPoolDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select 0.05% pool" }));
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Swap USDC / WETH" })).toBeNull();
    expect(screen.getByRole("button", { name: "Swap USDC / WETH" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Manage liquidity" }).hasAttribute("disabled")).toBe(true);
    const selected = screen.getAllByRole("row").find(row => row.getAttribute("aria-selected") === "true");
    expect(selected?.textContent).toContain("0.05%");
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByRole("button", { name: "Select 0.05% pool" });
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
  });

  it("cannot restore expired writes by reselecting the pinned pool", async () => {
    vi.useFakeTimers(); const now = Date.now(); vi.setSystemTime(now);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: multiple(now) })));
    render(<DemoPoolDiscovery />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" })); });
    expect(screen.getByRole("link", { name: "Manage liquidity" })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    fireEvent.click(screen.getByRole("button", { name: "Select 0.05% pool" }));
    fireEvent.click(screen.getByRole("button", { name: "Select 0.3% pool" }));
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.getByRole("button", { name: "Manage liquidity" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText("Historical · block 123")).toHaveLength(4);
  });

  it("binds detail to the fee and pool identity from navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: multiple() })));
    render(<DemoPoolDiscovery detail selection={{ fee: "500", pool: "0x2222222222222222222222222222222222222222" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByRole("region", { name: "Selected pool identity" });
    expect(within(screen.getByRole("region", { name: "Selected pool identity" })).getByText("Uniswap v3 / 0.05%")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Selected pool identity" })).getByRole("link", { name: /0x222222/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.getByText("Inspect six quote samples")).toBeTruthy();
  });

  it.each([
    { fee: "500", pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad" },
    { fee: "3000", pool: "bogus" },
    { fee: "3000" },
    { fee: "3000junk", pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad" },
  ])("rejects an invalid selection without falling back to a writeable pool: %j", async selection => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: multiple() })));
    render(<DemoPoolDiscovery detail selection={selection} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Selected pool not found");
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Selected pool identity" })).toBeNull();
  });

  it("filters by fee, status and identity, sorts rows, and reports an empty search", async () => {
    const report = multiple();
    report.pools[3].depthQualified = false;
    report.pools[3].samples = report.pools[3].samples.map(sample => ({ ...sample, amountOut: "98000", priceImpactBps: 200, withinImpactLimit: false }));
    report.candidateFeeTiers = [100, 500, 3000];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: report })));
    render(<DemoPoolDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByRole("table", { name: "Observed pools" });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort pools" }), { target: { value: "fee-desc" } });
    expect(screen.getAllByRole("row")[1].textContent).toContain("1%");
    fireEvent.change(screen.getByRole("combobox", { name: "Pool status" }), { target: { value: "outside-depth" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("row")[1].textContent).toContain("1%");
    fireEvent.change(screen.getByRole("combobox", { name: "Pool status" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search pools" }), { target: { value: "0x222222" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search pools" }), { target: { value: "missing" } });
    expect(screen.getByText("No pools match your filters.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
  });

  it("shows an empty observed report without manufacturing a supported pool", async () => {
    const report = curated(); report.pools = []; report.candidateFeeTiers = []; report.depthQualified = false;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: report })));
    render(<DemoPoolDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("No pools observed at this block.");
    expect(screen.queryByRole("link", { name: /pool detail/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
  });

  it("treats omitted query values as default detail selection when the pinned pool is absent", async () => {
    const report = curated(); report.pools = []; report.candidateFeeTiers = []; report.depthQualified = false;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ depth: report })));
    render(<DemoPoolDiscovery detail selection={{ fee: undefined, pool: undefined }} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh pool data" }));
    await screen.findByText("Curated pool not found");
    expect(screen.queryByRole("link", { name: "Manage liquidity" })).toBeNull();
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
