import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("loads LP reader and planner in the actual Node/tsx API runtime", async () => {
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    "await import('./src/modules/liquidity/testnet-lp-position.ts'); await import('./src/modules/liquidity/testnet-lp-plan.ts'); process.stdout.write('lp-loaded');"],
  { cwd: new URL("../../../", import.meta.url), timeout: 15000 });
  expect(result.stdout).toBe("lp-loaded");
});
