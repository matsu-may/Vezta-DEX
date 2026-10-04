async page => {
  // MOCK ONLY: disposable browser, all LP API reads intercepted; no RPC, wallet or broadcast.
  page.setDefaultTimeout(10000);
  const fixture = {"chainId": 84532, "manager": "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2", "pool": "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad", "owner": "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e", "source": "base-sepolia-rpc", "snapshot": {"number": "123", "hash": "0xabababababababababababababababababababababababababababababababab", "observedAt": "2026-10-02T00:00:00.000Z"}, "cursor": "0", "scanned": 1, "totalOwned": "1", "nextCursor": null, "incomplete": false, "poolTick": 0, "sqrtPriceX96": "79228162514264337593543950336", "positions": [{"tokenId": "42", "tickLower": -60, "tickUpper": 60, "liquidity": "1000000", "inRange": true, "state": "active", "currentAmounts": {"USDC": "2995", "WETH": "2995"}, "newFeesSinceCheckpoint": {"USDC": "1000000", "WETH": "2000000"}, "storedOwed": {"USDC": "5", "WETH": "7"}, "collectable": {"USDC": "1000005", "WETH": "2000007"}}], "runtimeVerified": true, "executionEnabled": false};
  const checks = []; const calls = []; let mode = "position"; let delayedResolve;
  await page.context().addInitScript(now => {
    window.__lpMock = { now, walletCalls: [] };
    Date.now = () => window.__lpMock.now;
    window.ethereum = { isMetaMask: true, request: async args => { window.__lpMock.walletCalls.push(args.method); throw new Error("LP reads must never prompt a wallet"); } };
  }, Date.parse(fixture.snapshot.observedAt) + 2000);
  await page.route("**/api/testnet-lp/positions", async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (mode === "error") return route.fulfill({ status: 503, json: { error: "Mock upstream unavailable" } });
    if (mode === "delayed") await new Promise(resolve => { delayedResolve = resolve; });
    const value = JSON.parse(JSON.stringify(fixture));
    if (mode === "empty") Object.assign(value, { positions: [], totalOwned: "0", scanned: 0 });
    if (mode === "pages") {
      Object.assign(value, { totalOwned: "2", cursor: body.cursor, nextCursor: body.cursor === "0" ? "1" : null, incomplete: body.cursor === "0" });
      if (body.cursor === "1") value.positions[0].tokenId = "43";
    }
    await route.fulfill({ status: 200, json: { page: value } });
  });
  const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
  const read = async () => { await page.getByRole("button", { name: "Read LP positions", exact: true }).click(); };
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("http://127.0.0.1:3020/demo/2");
  await page.getByRole("heading", { name: "Your positions" }).waitFor();
  check(calls.length === 0, "No API read on page load");
  check((await page.evaluate(() => window.__lpMock.walletCalls)).length === 0, "No wallet prompt on page load");
  await page.getByLabel("Position owner address").fill("bad");
  check(await page.getByRole("button", { name: "Read LP positions" }).isDisabled(), "Invalid owner cannot start a read");
  await page.getByLabel("Position owner address").fill(fixture.owner);
  await read(); await page.getByRole("heading", { name: "Position #42" }).waitFor();
  check(await page.getByText("Current principal", { exact: true }).count() === 1, "Principal is labelled separately");
  check(await page.getByText("Stored owed · mixed", { exact: true }).count() === 1, "Stored fees and withdrawn principal are not labelled profit");
  check(await page.getByRole("button", { name: "Study LP action", exact: true }).count() === 0, "Position reads do not open wallet action controls");
  await page.screenshot({ path: ".playwright-cli/demo-02-desktop.png", fullPage: true });
  mode = "empty"; await read(); await page.getByText("No positions owned", { exact: true }).waitFor();
  check(true, "Verified empty scan is distinct from failure");
  mode = "error"; await read(); await page.getByRole("region", { name: "Base Sepolia LP positions" }).getByRole("alert").waitFor();
  check(await page.getByText("No positions owned", { exact: true }).count() === 0, "RPC failure never displays empty ownership");
  mode = "pages"; await read(); await page.getByRole("heading", { name: "Position #42" }).waitFor();
  await page.getByRole("button", { name: "Scan next NFT" }).click();
  await page.getByRole("heading", { name: "Position #43" }).waitFor();
  check(calls[calls.length - 1].snapshot.hash === fixture.snapshot.hash && calls[calls.length - 1].cursor === "1", "Pagination binds the original block");
  check(await page.getByRole("heading", { name: "Position #42" }).count() === 1, "Previous pinned positions remain visible");
  mode = "delayed"; await read(); await page.getByText("Reading a pinned Base Sepolia block…").waitFor();
  await page.getByLabel("Position owner address").fill("0x1111111111111111111111111111111111111111");
  while (!delayedResolve) await page.waitForTimeout(20); delayedResolve();
  await page.waitForTimeout(200);
  check(await page.getByRole("heading", { name: "Position #42" }).count() === 0, "Changed owner discards late responses");
  mode = "pages"; await page.getByLabel("Position owner address").fill(fixture.owner); await read();
  await page.getByRole("heading", { name: "Position #42" }).waitFor();
  await page.evaluate(() => { window.__lpMock.now += 121000; });
  await page.getByText("Stale scan · refresh", { exact: true }).waitFor();
  check(await page.getByRole("button", { name: "Scan next NFT" }).isDisabled(), "Expired scans require a fresh first page");
  check((await page.evaluate(() => window.__lpMock.walletCalls)).length === 0, "The entire LP read flow uses no wallet methods");
  return { mockOnly: true, checks, apiCalls: calls.length };
}
