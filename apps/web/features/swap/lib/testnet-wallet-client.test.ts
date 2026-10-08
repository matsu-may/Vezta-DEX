import { expect, it, vi } from "vitest";
import { createTestnetWalletClient } from "./testnet-wallet-client";
it("uses fixed same-origin actions, preserves safe context/rate errors and never retries", async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: true }));
  expect(await createTestnetWalletClient(fetcher).call("quote", {})).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledWith("/api/testnet-wallet/quote", expect.objectContaining({ method: "POST", cache: "no-store", redirect: "error" }));
  for (const status of [410, 429]) {
    const fail = vi.fn(async () => Response.json({ error: "private provider", code: "TESTNET_CONTEXT_UNAVAILABLE" }, { status }));
    await expect(createTestnetWalletClient(fail).call("receipt", {})).rejects.toMatchObject({ status, code: "TESTNET_CONTEXT_UNAVAILABLE" });
    expect(fail).toHaveBeenCalledTimes(1);
  }
  const huge = vi.fn(async () => new Response("x".repeat(70000)));
  await expect(createTestnetWalletClient(huge).call("quote", {})).rejects.toThrow();
  expect(huge).toHaveBeenCalledTimes(1);
});
it("preserves bounded receipt error codes without exposing provider details", async () => {
  for (const code of ["TESTNET_RECEIPT_BUSY", "TESTNET_RECEIPT_TIMEOUT", "TESTNET_RECEIPT_STALE", "TESTNET_RECEIPT_INVALID"]) {
    const fetcher = vi.fn(async () => Response.json({ code, error: "private RPC key" }, { status: 503 }));
    await expect(createTestnetWalletClient(fetcher).call("receipt", {})).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledOnce();
  }
});
