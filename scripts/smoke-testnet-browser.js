// MOCK ONLY: pool discovery and quote snapshots; no wallet signature or broadcast.
await (async page => {
  const checks = [];
  let calls = 0;
  let fail = false;
  const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
  await page.context().addInitScript(() => {
    window.__dexTestnetWalletCalls = [];
    window.ethereum = { request: async ({ method }) => {
      window.__dexTestnetWalletCalls.push(method);
      throw new Error("Wallet access forbidden in read-only test");
    } };
  });
  await page.route("**/api/testnet-depth", async route => {
    calls += 1;
    if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Mock unavailable" }) });
    const inputs = ["100000", "1000000", "5000000", "10000000000000", "100000000000000", "1000000000000000"];
    const depth = { chainId: 84532, source: "base-sepolia-rpc", blockNumber: "123",
      blockHash: "0x" + "ab".repeat(32), observedAt: new Date(Date.now() - 2000).toISOString(),
      maxPriceImpactBps: 100, depthQualified: true, candidateFeeTiers: [500],
      pools: [{ address: "0x" + "11".repeat(20), feeTier: 500, depthQualified: true,
        samples: inputs.map((amountIn, i) => ({ direction: i < 3 ? "USDC_TO_WETH" : "WETH_TO_USDC", amountIn,
          available: true, amountOut: "99500", spotAmountOutAfterFee: "100000", priceImpactBps: 50,
          quoterGasEstimate: "120000", initializedTicksCrossed: 0, withinImpactLimit: true })) }] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ depth }) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3020/testnet");
  await page.getByRole("heading", { name: "Explore the testnet." }).waitFor();
  check(calls === 0, "No automatic pool read");
  await page.getByRole("button", { name: "Check Base Sepolia pools" }).click();
  await page.getByRole("button", { name: "Preview 0.05% pool" }).waitFor();
  check(await page.getByText("Estimated received", { exact: true }).count() === 0, "No automatic pool selection");
  await page.getByRole("button", { name: "Preview 0.05% pool" }).click();
  const preview = page.getByRole("region", { name: "Selected quote preview" });
  await preview.getByText("0.000000000000099002 WETH", { exact: true }).waitFor();
  check(true, "Integer quote and minimum preview");
  await page.getByLabel("Quote sample", { exact: true }).selectOption("4");
  await preview.getByText("0.0995 USDC", { exact: true }).waitFor();
  check(true, "Reverse direction uses USDC decimals");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Desktop has no horizontal overflow");
  await page.screenshot({ path: ".playwright-cli/testnet-desktop.png", fullPage: true });
  fail = true;
  await page.getByRole("button", { name: "Check Base Sepolia pools" }).click();
  await page.getByRole("alert").waitFor();
  check(await page.getByText("Estimated received", { exact: true }).count() === 0, "Failed refresh clears the previous quote");
  check((await page.evaluate(() => window.__dexTestnetWalletCalls)).length === 0, "No wallet request, signature or broadcast");
  return { mockOnly: true, checks, apiCalls: calls };
})(page);
