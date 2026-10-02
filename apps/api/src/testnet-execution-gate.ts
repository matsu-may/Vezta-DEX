// Consumer permission only; the API never signs or broadcasts a transaction.
export function testnetHttpExecutionEnabled(env: Record<string, string | undefined>, host: string, port: number) {
  return env.NODE_ENV === "development" && env.DEX_TESTNET_DEMO_ENABLED === "1"
    && env.DEX_TESTNET_BOUND_HOST === "127.0.0.1" && host === "127.0.0.1" && port === 3021;
}
