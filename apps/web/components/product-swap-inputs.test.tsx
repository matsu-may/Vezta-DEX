// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {DemoSwapInputs} from "./demo-swap-inputs";
afterEach(cleanup);
it("limits the picker to supported tokens and invalidates via the parent when reversing",()=>{
 const change=vi.fn();render(<DemoSwapInputs direction="forward" amount="1" disabled={false} onDirection={change} onAmount={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Select input token"}));
 expect(screen.getByRole("button",{name:"Choose WETH"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Choose WETH"}));expect(change).toHaveBeenCalledWith("reverse");
 expect(screen.queryByRole("button",{name:"Choose WETH"})).toBeNull();
});
