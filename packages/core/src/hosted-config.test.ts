import { expect, it } from "vitest";
import { readHostedConfig } from "./hosted-config";
const env = { NODE_ENV: "production", DEX_HOSTED_MODE: "1", DEX_PUBLIC_ORIGIN: "https://dex.example.com",
  DEX_API_URL: "https://api.example.com", DEX_BFF_TOKEN: "ab".repeat(32) };
it("requires complete hosted config and defaults writes off", () => {
  expect(readHostedConfig({})).toBeUndefined();
  expect(readHostedConfig(env)).toMatchObject({ publicOrigin: "https://dex.example.com", apiOrigin: "https://api.example.com", writesEnabled: false });
  expect(readHostedConfig({ ...env, DEX_HOSTED_WRITES_ENABLED: "1" })?.writesEnabled).toBe(true);
  for (const change of [{ NODE_ENV: "development" }, { DEX_BFF_TOKEN: "" }, { DEX_HOSTED_MODE: "true" },
    { DEX_PUBLIC_ORIGIN: "" }, { DEX_HOSTED_WRITES_ENABLED: "yes" }]) expect(() => readHostedConfig({ ...env, ...change })).toThrow("HOSTED_CONFIG_INVALID");
});
it("rejects insecure, local, credentialed, wildcard and configured-path origins", () => {
  for (const url of ["http://dex.example.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://api.local",
    "https://*.example.com", "https://user:pass@dex.example.com", "https://dex.example.com/path", "https://dex.example.com?key=x", "https://dex.example.com#x"]) {
    for (const key of ["DEX_PUBLIC_ORIGIN", "DEX_API_URL"]) expect(() => readHostedConfig({ ...env, [key]: url })).toThrow("HOSTED_CONFIG_INVALID");
  }
});
