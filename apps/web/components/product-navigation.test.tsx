// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { DemoNavigation } from "./demo-navigation";
vi.mock("next/navigation", () => ({ usePathname: () => "/explore/tokens", useSearchParams: () => new URLSearchParams("network=unichain-sepolia") }));
afterEach(cleanup);
it("opens both menus by hover or click and closes with Escape without navigating", () => {
  render(<DemoNavigation />);
  const explore = screen.getByRole("button", { name: "Explore" });
  fireEvent.mouseEnter(explore.closest(".product-nav-group")!);
  expect(explore.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "Tokens" }).getAttribute("href")).toBe("/explore/tokens?network=unichain-sepolia");
  fireEvent.keyDown(explore, { key: "Escape" });
  expect(explore.getAttribute("aria-expanded")).toBe("false");
  const pool = screen.getByRole("button", { name: "Pool" });
  fireEvent.click(pool);
  expect(screen.getByRole("link", { name: "Create position" }).getAttribute("href")).toBe("/positions/create?network=unichain-sepolia");
  expect(screen.getByRole("link", { name: /Launch auction/ }).getAttribute("href")).toContain("/liquidity/launch-auction");
});

it("keeps hover-open menus available on click and moves keyboard focus into them",async()=>{
 render(<DemoNavigation/>);
 const explore=screen.getByRole("button",{name:"Explore"});
 fireEvent.mouseEnter(explore.closest(".product-nav-group")!);fireEvent.click(explore);
 expect(explore.getAttribute("aria-expanded")).toBe("true");
 fireEvent.keyDown(explore,{key:"Escape"});fireEvent.keyDown(explore,{key:"ArrowDown"});
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("link",{name:"Tokens"})));
});
