import { afterEach, expect, it, vi } from "vitest";
import { browserCoordination } from "./rehearsal-coordination";
import { SUBMISSION_KEY } from "./rehearsal-storage";
afterEach(() => vi.unstubAllGlobals());
it("uses one exclusive nonqueued browser lock through the complete async action", async () => {
  const request = vi.fn(async (_key, options, callback) => { expect(options).toEqual({ mode: "exclusive", ifAvailable: true }); await callback({ name: SUBMISSION_KEY }); });
  vi.stubGlobal("navigator", { locks: { request } });
  const action = vi.fn(async () => {});
  await browserCoordination.run(action);
  expect(request).toHaveBeenCalledWith(SUBMISSION_KEY, expect.anything(), expect.any(Function));
  expect(action).toHaveBeenCalledTimes(1);
});
it("never invokes or queues an action when another tab holds the lock", async () => {
  vi.stubGlobal("navigator", { locks: { request: async (_key: unknown, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null) } });
  const action = vi.fn();
  await expect(browserCoordination.run(action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled();
});
it("fails closed without browser coordination support", async () => {
  vi.stubGlobal("navigator", {});
  const action = vi.fn();
  await expect(browserCoordination.run(action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled();
});
