import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@vezta-dex/core/swap-calldata": path.resolve(__dirname, "packages/core/src/swap-calldata.ts"),
      "@vezta-dex/core/swap-abi": path.resolve(__dirname, "packages/core/src/swap-abi.ts"),
      "@vezta-dex/core/permit-signature": path.resolve(__dirname, "packages/core/src/permit-signature.ts"),
      "@vezta-dex/core/transaction-receipt": path.resolve(__dirname, "packages/core/src/transaction-receipt.ts"),
      "@vezta-dex/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
  },
});
