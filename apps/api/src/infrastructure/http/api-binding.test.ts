import { describe, expect, it } from "vitest";
import { requirePrivateApiHost } from "./api-binding";

describe("standalone API binding", () => {
  it("accepts the explicit loopback address used by the local web and API", () => {
    expect(requirePrivateApiHost("127.0.0.1")).toBe("127.0.0.1");
  });

  it.each(["0.0.0.0", "::", "::1", "localhost", "192.168.1.5", "api.vezta.io", "127.0.0.1.evil.test"])(
    "refuses %s until public API access controls exist", host => {
      expect(() => requirePrivateApiHost(host)).toThrow("DEX API must bind to 127.0.0.1");
    },
  );
});
