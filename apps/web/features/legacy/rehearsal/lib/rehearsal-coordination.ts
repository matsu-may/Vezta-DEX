import { SUBMISSION_KEY } from "./rehearsal-storage";
export interface RehearsalCoordination {
  run(action: () => Promise<void>): Promise<void>;
}
export const browserCoordination: RehearsalCoordination = {
  async run(action) {
    if (typeof navigator === "undefined" || !navigator.locks?.request)
      throw new Error("Browser coordination unavailable");
    // Never queue a wallet action that could execute later without a new owner click.
    await navigator.locks.request(SUBMISSION_KEY, { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Another rehearsal tab is active");
      await action();
    });
  },
};
