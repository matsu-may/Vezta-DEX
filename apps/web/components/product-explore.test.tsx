// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductExplore } from "./product-explore";
import { testnetChainConfig } from "@vezta-dex/core";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("scopes supported tokens and catalog actions to the selected chain without loading remote data",()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const {unmount}=render(<ProductExplore chainId={1301} view="tokens"/>);
  expect(screen.getByText(testnetChainConfig(1301).candidate.USDC.address)).toBeTruthy();
  expect(screen.queryByText(testnetChainConfig(84532).candidate.USDC.address)).toBeNull();
  fireEvent.change(screen.getByLabelText("Search tokens"),{target:{value:"nomatch"}});
  expect(screen.getByText("No tokens match your search.")).toBeTruthy();unmount();
  render(<ProductExplore chainId={84532} view="pools"/>);
  expect(screen.getAllByRole("link",{name:/View .* pool/})).toHaveLength(4);
  expect(fetcher).not.toHaveBeenCalled();
});
it("explains unsupported auctions without offering approvals or a launch form",()=>{
  render(<ProductExplore chainId={1301} view="auctions"/>);
  expect(screen.getByRole("heading",{name:"Auctions are not supported yet"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:/submit|launch|approve/i})).toBeNull();
});
