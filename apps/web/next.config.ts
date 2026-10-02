import type { NextConfig } from "next";
import { resolve } from "node:path";

const workspaceRoot = resolve(__dirname, "../..");

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  transpilePackages: ["@vezta-dex/core"],
};

export default config;
