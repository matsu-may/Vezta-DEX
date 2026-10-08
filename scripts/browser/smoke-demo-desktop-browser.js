async page => {
  // MOCK ONLY: disposable session; all API requests intercepted, no owner wallet/RPC.
  const checks = []; const reads = []; const unexpected = [];
  const now = Date.now(); let mode = "ready";
  const inputs = ["100000", "1000000", "5000000", "10000000000000", "100000000000000", "1000000000000000"];
  const spotOutputs = ["50000000000000", "500000000000000", "2500000000000000", "20000", "200000", "2000000"];
  const quoteOutputs = ["49750000000000", "497500000000000", "2487500000000000", "19900", "199000", "1990000"];
  const depth = {
    chainId: 84532, source: "base-sepolia-rpc", blockNumber: "123",
    blockHash: `0x${"ab".repeat(32)}`, observedAt: new Date(now - 2000).toISOString(),
    maxPriceImpactBps: 100, depthQualified: true, candidateFeeTiers: [3000],
    pools: [{ address: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", feeTier: 3000, depthQualified: true,
      samples: inputs.map((amountIn, i) => ({ direction: i < 3 ? "USDC_TO_WETH" : "WETH_TO_USDC", amountIn,
        available: true, amountOut: quoteOutputs[i], spotAmountOutAfterFee: spotOutputs[i], priceImpactBps: 50,
        quoterGasEstimate: "120000", initializedTicksCrossed: 0, withinImpactLimit: true })) }],
  };
  const pinnedAddress = depth.pools[0].address;
  depth.pools = [100, 500, 3000, 10000].map((feeTier, index) => ({
    ...depth.pools[0], feeTier,
    address: feeTier === 3000 ? pinnedAddress : `0x${String(index + 1).repeat(40)}`,
    samples: depth.pools[0].samples.map(sample => ({ ...sample })),
  }));
  depth.pools[3].depthQualified = false;
  depth.pools[3].samples = depth.pools[3].samples.map(sample => ({ ...sample,
    amountOut: (BigInt(sample.spotAmountOutAfterFee) * 98n / 100n).toString(),
    priceImpactBps: 200, withinImpactLimit: false,
  }));
  depth.candidateFeeTiers = [100, 500, 3000];
  await page.context().addInitScript(now => {
    window.__desktopMock = { now, walletCalls: [] };
    Date.now = () => window.__desktopMock.now;
    window.ethereum = { isMetaMask: true, request: async args => { window.__desktopMock.walletCalls.push(args.method); throw new Error("Read flow cannot prompt a wallet"); } };
  }, now);
  await page.route("**/api/**", async route => {
    const pathname = route.request().url().split("/api/")[1]?.split("?")[0];
    if (pathname !== "testnet-depth") {
      unexpected.push(pathname); return route.fulfill({ status: 503, json: { error: "Mock guard" } });
    }
    reads.push(pathname);
    if (mode === "error") return route.fulfill({ status: 503, json: { error: "Mock read unavailable" } });
    const report = JSON.parse(JSON.stringify(depth));
    if (mode === "missing") Object.assign(report, { pools: [], candidateFeeTiers: [], depthQualified: false });
    await route.fulfill({ status: 200, json: { depth: report } });
  });
  const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("http://127.0.0.1:3020/demo/3");
  await page.getByRole("heading", { name: "Explore" }).waitFor();
  check(reads.length === 0, "Explore performs no automatic API reads");
  check(await page.getByRole("banner").getByRole("link", { name: "Base Sepolia TESTNET", exact: true }).isVisible(), "Explore labels the test network");
  await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByRole("table", { name: "Observed pools" }).waitFor();
  const pools = page.getByRole("table", { name: "Observed pools" });
  check(await pools.locator("tbody tr").count() === 4, "Explore lists all four observed pools");
  check(await pools.locator('tr[aria-selected="true"]').textContent().then(text => text.includes("0.3%")), "Explore defaults to the pinned 0.3% pool");
  check(await page.getByText("Read-only · unqualified execution", { exact: true }).count() === 3, "Other fee tiers remain read-only independently of depth");
  await page.getByRole("combobox", { name: "Sort pools" }).selectOption("fee-desc");
  check(await pools.locator("tbody tr").first().textContent().then(text => text.includes("1%")), "Fee sorting changes row order");
  await page.getByRole("combobox", { name: "Pool status" }).selectOption("outside-depth");
  check(await pools.locator("tbody tr").count() === 1, "Depth filter shows the failed candidate");
  check(await page.getByRole("link", { name: "Manage liquidity" }).count() === 0, "Hidden selection does not expose execution navigation");
  await page.getByRole("combobox", { name: "Pool status" }).selectOption("all");
  await page.getByRole("searchbox", { name: "Search pools" }).fill("0x222222");
  check(await pools.locator("tbody tr").count() === 1, "Address search identifies a specific pool");
  await page.getByRole("searchbox", { name: "Search pools" }).fill("no matching pool");
  await page.getByText("No pools match your filters.", { exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Search pools" }).fill("");
  await page.getByRole("combobox", { name: "Sort pools" }).selectOption("fee-asc");
  await page.screenshot({ path: ".playwright-cli/demo-03-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Select 0.05% pool" }).click();
  check(await page.getByRole("link", { name: "Swap USDC / WETH" }).count() === 0, "Selecting another pool removes swap navigation");
  check(await page.getByRole("button", { name: "Manage liquidity" }).isDisabled(), "Selecting another pool disables liquidity navigation");
  await page.getByRole("link", { name: "View 0.05% pool detail" }).click();
  await page.getByRole("heading", { name: "USDC / WETH" }).waitFor();
  check(reads.length === 1, "Detail requires its own explicit refresh");
  const selection = await page.evaluate(() => { const params = new URL(window.location.href).searchParams; return { fee: params.get("fee"), pool: params.get("pool") }; });
  check(selection.fee === "500" && selection.pool === "0x2222222222222222222222222222222222222222", "Detail navigation preserves fee and address identity");
  await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByRole("region", { name: "Selected pool identity" }).waitFor();
  check(await page.getByRole("region", { name: "Selected pool identity" }).getByText("Uniswap v3 / 0.05%", { exact: true }).isVisible(), "Detail renders the requested alternative pool");
  check(await page.getByRole("link", { name: "Manage liquidity" }).count() === 0, "Read-only detail cannot enter a wallet workflow");
  await page.screenshot({ path: ".playwright-cli/demo-04-read-only-pool.png", fullPage: true });
  for (const query of [
    `fee=500&pool=${pinnedAddress}`,
    "fee=3000&pool=bogus",
    "fee=3000",
    `fee=3000&fee=500&pool=${pinnedAddress}`,
  ]) {
    await page.goto(`http://127.0.0.1:3020/demo/4?${query}`);
    await page.getByRole("button", { name: "Refresh pool data" }).click();
    await page.getByText("Selected pool not found", { exact: true }).waitFor();
    check(await page.getByRole("link", { name: "Manage liquidity" }).count() === 0, `Invalid selection rejects execution: ${query}`);
  }
  const beforeDefaultNavigation = reads.length;
  await page.goto("http://127.0.0.1:3020/demo/4");
  await page.getByRole("heading", { name: "USDC / WETH" }).waitFor();
  check(reads.length === beforeDefaultNavigation, "Default pool detail still requires an explicit read");
  await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByText("Depth screen passed", { exact: true }).waitFor();
  await page.getByText("Inspect six quote samples", { exact: true }).click();
  check(await page.locator("tbody tr").count() === 6, "Detail shows all six read-only quote samples");
  await page.screenshot({ path: ".playwright-cli/demo-04-desktop.png", fullPage: true });
  await page.evaluate(() => { window.__desktopMock.now += 121000; });
  await page.getByText("Snapshot expired · refresh required", { exact: true }).waitFor();
  check(await page.getByRole("link", { name: "Manage liquidity" }).count() === 0, "Expired snapshots remove workflow actions");
  await page.evaluate(now => { window.__desktopMock.now = now; }, now);
  mode = "error"; await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByRole("alert").filter({ hasText: "Pool data unavailable" }).waitFor();
  check(await page.getByText("Depth screen passed", { exact: true }).count() === 0, "Failure clears earlier qualification");
  mode = "missing"; await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByText("Curated pool not found", { exact: true }).waitFor();
  check(await page.getByRole("link", { name: "Swap USDC / WETH" }).count() === 0, "Missing pool does not offer execution links");
  mode = "ready"; await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByText("Depth screen passed", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Swap USDC / WETH" }).click();
  await page.getByRole("heading", { name: "Swap tokens", exact: true }).waitFor();
  const nav = page.getByRole("navigation", { name: "Demo navigation" });
  check(await nav.getByRole("link", { name: "Swap", exact: true }).getAttribute("aria-current") === "page", "Swap navigation marks the active route");
  await nav.getByRole("link", { name: "Positions", exact: true }).click();
  await page.waitForURL("**/demo/2");
  check(await page.getByRole("navigation", { name: "Demo navigation" }).count() === 1, "Liquidity route completes desktop navigation");
  await page.goto("http://127.0.0.1:3020/demo/3");
  await page.setViewportSize({ width: 768, height: 1024 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Explore has no tablet horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1080 });
  check((await page.evaluate(() => window.__desktopMock.walletCalls)).length === 0, "No wallet prompts across desktop routes");
  check(unexpected.length === 0, "All expected API reads stay within the discovery endpoint");
  return { mockOnly: true, checks, discoveryReads: reads.length, screenshots: [".playwright-cli/demo-03-desktop.png", ".playwright-cli/demo-04-desktop.png", ".playwright-cli/demo-04-read-only-pool.png"] };
}
