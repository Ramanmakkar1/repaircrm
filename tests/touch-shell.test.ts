import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/tickets" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

import { createInstructionsGate } from "@/components/pwa/install-gate";
import { MobileNavigation } from "@/components/shell/mobile-navigation";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("bottom bar: the current tab is not shown by colour alone", () => {
  beforeEach(() => { nav.path = "/tickets/job-1"; });
  const tabs = () => renderToStaticMarkup(createElement(MobileNavigation, { role: "OWNER" })).match(/<a [^>]*>.*?<\/a>/g) ?? [];

  it("marks the current tab with a bar and a heavier icon, and keeps aria-current", () => {
    const [home, repairs] = tabs();
    expect(repairs).toContain('aria-current="page"');
    expect(repairs).toMatch(/<span aria-hidden="true" class="[^"]*bg-current/);
    expect(repairs).toContain('stroke-width="2.75"');
    expect(home).not.toContain("aria-current");
    expect(home).not.toContain("bg-current");
    expect(home).toContain('stroke-width="2"');
  });

  it("marks exactly one tab", () => {
    expect(tabs().filter((tab) => tab.includes("bg-current"))).toHaveLength(1);
  });

  it("uses theme colours only, so Dark has the same cue", () => {
    const html = renderToStaticMarkup(createElement(MobileNavigation, { role: "STAFF" }));
    expect(html).not.toMatch(/\b(?:bg-white|text-white|(?:bg|text|border)-blue-\d+)\b|#[0-9a-f]{3,8}\b/i);
  });
});

describe("side safe-area insets (landscape notch)", () => {
  it("pads the bottom bar's left and right as well as its bottom", () => {
    const html = renderToStaticMarkup(createElement(MobileNavigation, { role: "OWNER" }));
    expect(html).toContain("env(safe-area-inset-left)");
    expect(html).toContain("env(safe-area-inset-right)");
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("gives the header and the page content a gutter that never goes under an inset", () => {
    const css = read("app/globals.css");
    const rule = css.match(/\.rf-gutter\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/padding-left:\s*max\(var\(--gutter\),\s*env\(safe-area-inset-left\)\)/);
    expect(rule).toMatch(/padding-right:\s*max\(var\(--gutter\),\s*env\(safe-area-inset-right\)\)/);
    // Portrait keeps the old px-4 / sm:px-6 / xl:px-12 gutters.
    expect(rule).toContain("--gutter: 1rem");
    expect(css).toMatch(/@media \(min-width: 40rem\) \{ \.rf-gutter \{ --gutter: 1\.5rem; \} \}/);
    expect(css).toMatch(/@media \(min-width: 80rem\) \{ \.rf-gutter \{ --gutter: 3rem; \} \}/);

    const shell = read("components/shell/app-shell.tsx");
    expect(shell.match(/rf-gutter/g)).toHaveLength(2); // header + <main> content
    expect(shell).not.toMatch(/\bpx-4\b|sm:px-6|xl:px-12/);
  });
});

describe("Easy-mode surfaces follow the theme", () => {
  // Hard-coded white / blue / black stays bright or unreadable when the account menu switches to Dark.
  const fixed = /\b(?:bg-white|bg-black|text-white|(?:bg|text|border)-(?:blue|zinc)-\d+)\b|\[#[0-9a-f]{3,8}\]/i;

  it.each([
    "app/(app)/counter/[area]/page.tsx",
    "components/shell/app-shell.tsx",
    "components/shell/mobile-navigation.tsx",
    "components/shell/workspace-controls.tsx",
    "components/ui/entry-mode.tsx",
    "components/ui/guided-form.tsx",
    "components/tickets/ticket-form.tsx",
    "components/billing/document-form.tsx",
  ])("%s uses theme tokens, not fixed colours", (path) => {
    expect(read(path)).not.toMatch(fixed);
  });
});

describe("install how-to dialog waits for the account menu to close", () => {
  const event = () => ({ preventDefault: vi.fn() });

  it("does not open while the menu is still closing", () => {
    const open = vi.fn();
    createInstructionsGate(open).request();
    expect(open).not.toHaveBeenCalled();
  });

  it("opens once the menu has closed, and keeps focus for the dialog", () => {
    const open = vi.fn();
    const gate = createInstructionsGate(open);
    const closed = event();
    gate.request();
    gate.menuClosed(closed);
    expect(open).toHaveBeenCalledOnce();
    expect(closed.preventDefault).toHaveBeenCalledOnce();
  });

  it("opens only once per request, and a menu closing with no request is left alone", () => {
    const open = vi.fn();
    const gate = createInstructionsGate(open);
    const untouched = event();
    gate.menuClosed(untouched);
    expect(open).not.toHaveBeenCalled();
    expect(untouched.preventDefault).not.toHaveBeenCalled(); // focus returns to the menu button as usual

    gate.request();
    gate.menuClosed(event());
    gate.menuClosed(event());
    expect(open).toHaveBeenCalledOnce();
  });

  it("is wired in: the provider asks the gate, and the account menu reports its close", () => {
    expect(read("components/pwa/install-provider.tsx")).toContain("gate.request()");
    expect(read("components/shell/user-menu.tsx")).toContain("onCloseAutoFocus={install?.menuClosed}");
  });
});
