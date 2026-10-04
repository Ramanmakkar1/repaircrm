import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/tickets/t1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string }) => createElement("img", { src: props.src, alt: props.alt }) }));
vi.mock("@/app/(app)/prefs-actions", () => ({ setDensityAction: vi.fn(), setThemeAction: vi.fn(), setSimpleModeAction: vi.fn() }));
vi.mock("@/app/(app)/counter/screen-style-actions", () => ({ setScreenStyleAction: vi.fn() }));
vi.mock("@/app/(app)/assistant/actions", () => ({ confirmAssistantAction: vi.fn(), confirmRemoveProductAction: vi.fn(), runAssistantAction: vi.fn() }));
vi.mock("@/app/(app)/assistant/suggestions", () => ({ assistantSuggestions: vi.fn() }));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("@/lib/location-actions", () => ({ setLocationCookie: vi.fn() }));

const { AppShell } = await import("@/components/shell/app-shell");
/** The shell takes its page as children: passed as createElement's third argument. */
const Shell = AppShell as unknown as (props: Record<string, unknown>) => ReturnType<typeof AppShell>;

const user = { name: "Dana Owner", email: "dana@example.com", role: "OWNER" };
const prefs = { density: "comfortable" as const, theme: "light" as const, railCollapsed: false, simple: true };

function shell(path: string, simple = true) {
  nav.path = path;
  return renderToStaticMarkup(
    createElement(Shell, {
      user,
      locations: [{ id: "a", name: "Main" }, { id: "b", name: "Northside Kiosk" }],
      currentLocationId: "a",
      prefs: { ...prefs, simple },
      assistant: { enabled: true, cloud: false },
    }, createElement("p", null, "page")),
  );
}

describe("the shell renders on the server in both modes", () => {
  it("draws the controls row: Back to the parent, Home, the shop, Search, Needs you and the account", () => {
    const html = shell("/tickets/t1");
    expect(html).toContain('aria-label="Back to Repairs"');
    expect(html).toContain('href="/tickets"');
    expect(html).toContain('href="/counter"');
    expect(html).toContain('aria-label="Shop: Main. Change shop"');
    expect(html).toContain("Search name, phone or #");
    expect(html).toContain('aria-label="Needs you: nothing waiting"');
    expect(html).toContain(", your account and screen settings (Dana Owner)");
    expect(html).toContain('data-touch-workspace="true"');
    expect(html).toContain("rf-main");
  });

  it("shows one Home button instead of two when Back would only go Home", () => {
    const html = shell("/customers");
    expect(html).toContain('aria-label="Back to Home"');
    // Phone keeps the arrow; from sm up the single Home button is the outline one.
    expect(html).toMatch(/<a[^>]*href="\/counter"[^>]*aria-label="Back to Home"[^>]*>/);
  });

  it("shows Back on a guided entry screen too (it used to hide at tablet width)", () => {
    expect(shell("/tickets/new")).toContain('aria-label="Back to Repairs"');
  });

  it("Full mode has no Easy attribute and keeps the same controls", () => {
    const html = shell("/dashboard", false);
    expect(html).not.toContain('data-touch-workspace="true"');
    expect(html).toContain('aria-label="Needs you: nothing waiting"');
  });

  it("Home shows the shop label instead of Back", () => {
    const html = shell("/counter");
    expect(html).not.toContain("Back to");
    expect(html).toContain("Your shop");
  });
});
