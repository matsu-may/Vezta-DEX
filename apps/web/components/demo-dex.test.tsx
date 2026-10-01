// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoDex } from "./demo-dex";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("standalone DEX demo walkthrough", () => {
  it("labels every workflow as simulated and resets a changed virtual wallet", () => {
    const fetchMock = vi.fn(() => { throw new Error("Demo must not fetch live data"); });
    vi.stubGlobal("fetch", fetchMock);
    render(<DemoDex />);
    expect(screen.getByText(/no wallet or real transaction/i)).toBeTruthy();
    expect(screen.getByText("1,000 USDC")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Demo swap amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview simulated swap" }));
    expect(screen.getByText("Minimum simulated output")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simulate swap" }));
    expect(screen.getByText("990 USDC")).toBeTruthy();
    expect(screen.getByText(/Local action #1 · simulated swap/i)).toBeTruthy();
    expect(screen.getByText("Sent 10 USDC")).toBeTruthy();
    expect(screen.getByText(/Received .* WETH/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(screen.getByText("1,000 USDC")).toBeTruthy();
    expect(screen.queryByText(/Local action #1 · simulated swap/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalidates reviewed output when input changes and blocks an unaffordable swap", () => {
    render(<DemoDex />);
    const amount = screen.getByLabelText("Demo swap amount");
    fireEvent.change(amount, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview simulated swap" }));
    expect(screen.getByRole("button", { name: "Simulate swap" })).toBeTruthy();
    fireEvent.change(amount, { target: { value: "11" } });
    expect(screen.queryByRole("button", { name: "Simulate swap" })).toBeNull();
    fireEvent.change(amount, { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview simulated swap" }));
    expect(screen.getByRole("alert").textContent).toMatch(/insufficient demo balance/i);
    expect(screen.getByText("1,000 USDC")).toBeTruthy();
  });

  it("demonstrates LP create, increase, partial/full remove, separate collect and close", () => {
    render(<DemoDex />);
    fireEvent.click(screen.getByRole("button", { name: "Create demo position" }));
    expect(screen.getByText("Demo position #1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase demo liquidity" }));
    expect(screen.getByText("125 demo liquidity units")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Credit example fee" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove half" }));
    expect(screen.getByText("Principal owed, not yet in wallet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collect owed tokens" }));
    expect(screen.getByText(/Local action #5 · simulated collect/i)).toBeTruthy();
    expect(screen.getByText("62 USDC principal + 0.25 USDC example fee")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collect owed tokens" }).getAttribute("disabled")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(screen.getByRole("button", { name: "Close demo position" }).getAttribute("disabled")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Collect owed tokens" }));
    fireEvent.click(screen.getByRole("button", { name: "Close demo position" }));
    expect(screen.queryByText("Demo position #1")).toBeNull();
    expect(screen.getByText(/Local action #8 · simulated close/i)).toBeTruthy();
  });
});
