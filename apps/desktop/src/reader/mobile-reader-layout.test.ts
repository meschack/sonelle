// @ts-expect-error The browser app intentionally omits Node types; Vitest provides this test runtime.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productShellCss = readFileSync(
  new URL("../styles/product-shell.css", import.meta.url),
  "utf8"
);
const readerBaseCss = readFileSync(new URL("../styles/reader-base.css", import.meta.url), "utf8");
const appDocument = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("mobile reader layout contract", () => {
  it("keeps portrait and narrow controls touchable without ignoring cutouts", () => {
    expect(appDocument).toContain("viewport-fit=cover");
    expect(productShellCss).toContain("--mobile-touch-target: 48px");
    expect(productShellCss).toContain("calc(8px + env(safe-area-inset-top))");
    expect(productShellCss).toContain("env(safe-area-inset-bottom)");
    expect(productShellCss).toContain('"copy settings"');
    expect(productShellCss).toContain('"transport transport"');
  });

  it("keeps the reading surface ordered and reachable under large text", () => {
    expect(readerBaseCss).toContain("text-size-adjust: 100%");
    expect(productShellCss).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto");
    expect(productShellCss).toContain(".mobile-reader-content-slot .reader-layout");
    expect(productShellCss).toContain("overflow: auto");
    expect(productShellCss).toContain(".mobile-reader-tools-slot button");
  });

  it("provides a short-landscape layout instead of clipping mobile chrome", () => {
    expect(productShellCss).toContain("@media (orientation: landscape) and (max-height: 600px)");
    expect(productShellCss).toContain(
      "min-height: calc(100dvh - max(8px, env(safe-area-inset-top)))"
    );
    expect(productShellCss).toContain("padding-block: 18px 28px");
  });
});
