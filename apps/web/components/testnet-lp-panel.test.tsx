// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TestnetLpPanel } from "./testnet-lp-panel";
import { lpBrowserPage } from "../lib/fixtures/testnet-lp-browser";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reads explicitly without wallet prompts and separates principal, new fees and mixed owed", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(lpBrowserPage.snapshot.observedAt) + 2000);
  const fetcher = vi.fn(async () => Response.json({ page: lpBrowserPage })); vi.stubGlobal("fetch", fetcher);
  render(<TestnetLpPanel />); expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Position owner address"), { target: { value: lpBrowserPage.owner } });
  fireEvent.click(screen.getByRole("button", { name: "Read LP positions" }));
  await screen.findByText("Position #42");
  expect(screen.getByText("Current principal")).toBeTruthy();
  expect(screen.getByText("New fees since checkpoint")).toBeTruthy();
  expect(screen.getByText("Stored owed · mixed")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create position" }).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Position owner address"), { target: { value: "bad" } });
  expect(screen.queryByText("Position #42")).toBeNull();
});
it("distinguishes a qualified empty scan from RPC unavailable", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(lpBrowserPage.snapshot.observedAt) + 2000);
  let fail = false;
  vi.stubGlobal("fetch", async () => fail ? Response.json({ error: "secret" }, { status: 503 }) : Response.json({ page: { ...lpBrowserPage, totalOwned: "0", scanned: 0, positions: [] } }));
  render(<TestnetLpPanel />); fireEvent.change(screen.getByLabelText("Position owner address"), { target: { value: lpBrowserPage.owner } });
  fireEvent.click(screen.getByRole("button", { name: "Read LP positions" })); await screen.findByText("No positions owned");
  fail = true; fireEvent.click(screen.getByRole("button", { name: "Read LP positions" }));
  await screen.findByRole("alert"); expect(screen.queryByText("No positions owned")).toBeNull();
  expect(screen.queryByText("secret")).toBeNull();
});
