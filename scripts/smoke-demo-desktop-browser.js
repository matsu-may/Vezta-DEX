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
  check(await page.getByText("Base Sepolia · Testnet", { exact: true }).count() === 1, "Explore labels the test network");
  await page.getByRole("button", { name: "Refresh pool data" }).click();
  await page.getByText("Depth screen passed", { exact: true }).waitFor();
  await page.screenshot({ path: ".playwright-cli/demo-03-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "View pool detail" }).click();
  await page.getByRole("heading", { name: "USDC / WETH" }).waitFor();
  check(reads.length === 1, "Detail requires its own explicit refresh");
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
  await page.getByRole("heading", { name: "Swap", exact: true }).waitFor();
  const nav = page.getByRole("navigation", { name: "Demo navigation" });
  check(await nav.getByRole("link", { name: "Swap", exact: true }).getAttribute("aria-current") === "page", "Swap navigation marks the active route");
  await nav.getByRole("link", { name: "Liquidity", exact: true }).click();
  await page.waitForURL("**/demo/2");
  check(await page.getByRole("navigation", { name: "Demo navigation" }).count() === 1, "Liquidity route completes desktop navigation");
  await page.goto("http://127.0.0.1:3020/demo/3");
  await page.setViewportSize({ width: 768, height: 1024 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Explore has no tablet horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1080 });
  check((await page.evaluate(() => window.__desktopMock.walletCalls)).length === 0, "No wallet prompts across desktop routes");
  check(unexpected.length === 0, "All expected API reads stay within the discovery endpoint");
  return { mockOnly: true, checks, discoveryReads: reads.length, screenshots: [".playwright-cli/demo-03-desktop.png", ".playwright-cli/demo-04-desktop.png"] };
}
