import { describe, expect, it, vi } from "vitest";
import { keepDataOnThisPhone } from "./persistent-storage";

describe("keepDataOnThisPhone", () => {
  it("asks only when the data is not kept yet", async () => {
    const persist = vi.fn(async () => true);
    expect(await keepDataOnThisPhone({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();

    expect(await keepDataOnThisPhone({ persisted: async () => false, persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("accepts a no, a missing API or an error quietly", async () => {
    const no = { persisted: async () => false, persist: async () => false };
    expect(await keepDataOnThisPhone(no)).toBe(false);
    expect(await keepDataOnThisPhone(undefined)).toBe(false);
    const broken = {
      persisted: async () => {
        throw new Error("blocked");
      },
      persist: async () => true,
    };
    expect(await keepDataOnThisPhone(broken)).toBe(false);
  });
});
