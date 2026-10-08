import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@vezta-dex/core/swap-calldata": path.resolve(__dirname, "packages/core/src/swap/swap-calldata.ts"),
      "@vezta-dex/core/swap-abi": path.resolve(__dirname, "packages/core/src/swap/swap-abi.ts"),
      "@vezta-dex/core/permit-signature": path.resolve(__dirname, "packages/core/src/swap/permit-signature.ts"),
      "@vezta-dex/core/transaction-receipt": path.resolve(__dirname, "packages/core/src/transaction/transaction-receipt.ts"),
      "@vezta-dex/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // Bound subprocess pressure on the shared developer host.
    maxWorkers: 1,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
  },
});
