/** Keep unauthed preparation endpoints on this machine until the public API boundary is designed. */
export function requirePrivateApiHost(host: string): "127.0.0.1" {
  if (host !== "127.0.0.1") throw new Error("DEX API must bind to 127.0.0.1");
  return host;
}
