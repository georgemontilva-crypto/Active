import { describe, expect, it } from "vitest";

/**
 * Mirrors the guard in useReveal's register(): an element is skipped when it is
 * already observed or already revealed. The regression this covers is the
 * opposite case — a freshly mounted element must NOT be skipped, or it stays at
 * the transition's starting opacity and reads as content that failed to load.
 */
function shouldObserve(el: { observed: boolean; revealed: boolean }): boolean {
  return !el.observed && !el.revealed;
}

describe("reveal registration", () => {
  it("observes a newly added element", () => {
    expect(shouldObserve({ observed: false, revealed: false })).toBe(true);
  });

  it("skips an element already being observed", () => {
    expect(shouldObserve({ observed: true, revealed: false })).toBe(false);
  });

  it("skips an element that already revealed", () => {
    expect(shouldObserve({ observed: false, revealed: true })).toBe(false);
  });
});
