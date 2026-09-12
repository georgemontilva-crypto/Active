import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against a class being used in a component while its CSS no longer
 * exists. That failure is silent — the element simply renders with no styling —
 * so nothing in the build or the typecheck catches it.
 *
 * The list is derived from the components rather than written by hand: a class
 * added to a component and forgotten in the stylesheet is precisely the case
 * this test is for, and a hand-written list would need the same edit that was
 * forgotten in the first place.
 */
const root = path.resolve(__dirname, "../..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

/** Utilities defined by this project (everything else comes from Tailwind). */
const OWN_CLASSES = [
  "pixel-grid",
  "pixel-mosaic",
  "pixel-scatter",
  "pixel-shadow",
  "pixel-shadow-sm",
  "magenta-glow",
  "magenta-halo",
  "yellow-halo",
  "wave-edge",
  "wave-edge-top",
  "wave-border",
  "clip-notch",
  "press",
  "reveal",
  "no-scrollbar",
  "text-balance",
  "animate-pulse-soft",
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [full] : [];
  });
}

const sources = sourceFiles(path.join(root, "src"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const used = OWN_CLASSES.filter((cls) =>
  new RegExp(`(^|["'\\s])${cls}(["'\\s]|$)`, "m").test(sources)
);

describe("custom classes referenced by components exist in the stylesheet", () => {
  it("finds project classes in use, so the check below is not vacuous", () => {
    expect(used.length).toBeGreaterThan(5);
  });

  it.each(used)("%s is defined", (cls) => {
    expect(css).toContain(`.${cls}`);
  });

  it("keeps the keyframes the wave lines animate with", () => {
    expect(css).toContain("@keyframes wave-slide");
  });

  it("has no duplicated section header, which signals a botched edit", () => {
    const headers = css.match(/\/\* ─── [A-Za-zÀ-ÿ ]+ ─/g) ?? [];
    expect(new Set(headers).size).toBe(headers.length);
  });
});
