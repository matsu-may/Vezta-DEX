// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {DemoSwapInputs} from "../../features/swap/components/demo-swap-inputs";
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal ??= function(){};HTMLDialogElement.prototype.close ??= function(){};
 vi.spyOn(HTMLDialogElement.prototype,"showModal").mockImplementation(function(this:HTMLDialogElement){this.setAttribute("open","");});
 vi.spyOn(HTMLDialogElement.prototype,"close").mockImplementation(function(this:HTMLDialogElement){this.removeAttribute("open");});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("selects only a supported chain token through a searchable modal and restores trigger focus",()=>{
 const direction=vi.fn();render(<DemoSwapInputs direction="forward" amount="1" disabled={false} chainId={1301} onDirection={direction} onAmount={vi.fn()}/>);
 const trigger=screen.getByRole("button",{name:"Select input token"});trigger.focus();fireEvent.click(trigger);
 const dialog=screen.getByRole("dialog",{name:"Select a token"});
 expect(within(dialog).getByText("Unichain Sepolia")).toBeTruthy();
 fireEvent.change(within(dialog).getByRole("searchbox"),{target:{value:"wrapped"}});
 expect(within(dialog).queryByRole("button",{name:"Choose USDC"})).toBeNull();
 fireEvent.click(within(dialog).getByRole("button",{name:"Choose WETH"}));
 expect(direction).toHaveBeenCalledWith("reverse");expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(trigger);
});
it("closing token selection does not change the pair",()=>{
 const direction=vi.fn();render(<DemoSwapInputs direction="forward" amount="1" disabled={false} onDirection={direction} onAmount={vi.fn()}/>);
 fireEvent.click(screen.getByRole("button",{name:"Select output token"}));fireEvent.click(screen.getByRole("button",{name:"Close Select a token"}));
 expect(direction).not.toHaveBeenCalled();
});
