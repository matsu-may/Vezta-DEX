// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { SwapForm } from "./swap-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SwapForm", () => {
  it("clears pending quote state when the amount changes", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    render(<SwapForm />);
    fireEvent.click(screen.getByRole("button", { name: "Get fresh quote" }));
    expect((await screen.findByRole("button", { name: "Reading Polygon…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "200" } });
    expect((screen.getByRole("button", { name: "Get fresh quote" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
