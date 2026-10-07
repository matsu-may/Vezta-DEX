// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {DemoSwapInputs} from "./demo-swap-inputs";
beforeEach(()=>{HTMLDialogElement.prototype.showModal ??= function(){};HTMLDialogElement.prototype.close ??= function(){};vi.spyOn(HTMLDialogElement.prototype,"showModal").mockImplementation(function(this:HTMLDialogElement){this.setAttribute("open","");});vi.spyOn(HTMLDialogElement.prototype,"close").mockImplementation(function(this:HTMLDialogElement){this.removeAttribute("open");});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("limits the picker to supported tokens and invalidates via the parent when reversing",()=>{
 const change=vi.fn();render(<DemoSwapInputs direction="forward" amount="1" disabled={false} onDirection={change} onAmount={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Select input token"}));
 expect(screen.getByRole("button",{name:"Choose WETH"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Choose WETH"}));expect(change).toHaveBeenCalledWith("reverse");
 expect(screen.queryByRole("button",{name:"Choose WETH"})).toBeNull();
});
