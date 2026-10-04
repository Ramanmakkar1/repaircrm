import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/invoices/i1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string }) => createElement("img", { src: props.src, alt: props.alt }) }));
vi.mock("@/lib/location-actions", () => ({ setLocationCookie: vi.fn() }));

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeaderSkeleton, PictureTileGridSkeleton, RecordCardsSkeleton } from "@/components/ui/skeleton";
import { Breadcrumbs, PageHeader, PAGE_TITLE_CLASS } from "@/components/ui/page-header";
import { activeTab, MobileNavigation, phoneTabs } from "@/components/shell/mobile-navigation";
import { LocationSwitcher } from "@/components/shell/location-switcher";
import { roleWords } from "@/components/shell/user-menu";
import { errorNextStep, errorToastOptions, makeErrorsSticky } from "@/components/ui/toaster";
import { isInAppNavigation } from "@/components/shell/navigation-progress";
import { prefersFinePointer, SEARCH_INPUT_PROPS } from "@/components/ui/auto-focus";
import { LinkPending } from "@/components/ui/link-pending";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);

describe("EmptyState: a picture, plain words, one big action", () => {
  it("draws the picture, an 18px title and the one primary button", () => {
    const out = html(createElement(EmptyState, { photo: "/images/home/pickup-bag.webp", title: "Nothing ready for pickup", hint: "Repairs marked Ready show up here.", actionLabel: "See all repairs", actionHref: "/tickets" }));
    expect(out).toContain('src="/images/home/pickup-bag.webp"');
    expect(out).toContain("text-[18px]");
    expect(out).toMatch(/<a href="\/tickets"[^>]*min-h-12[^>]*>See all repairs<\/a>/);
  });

  it("keeps older callers working: an icon and any action node", () => {
    const Icon = () => createElement("svg", { "data-icon": "x" });
    const out = html(createElement(EmptyState, { icon: Icon, title: "None", action: createElement("button", null, "Clear filters") }));
    expect(out).toContain('data-icon="x"');
    expect(out).toContain("<button>Clear filters</button>");
  });
});

describe("loading skeletons match the real page", () => {
  it("PageHeaderSkeleton has no phantom icon tile by default, so the title does not jump", () => {
    expect(html(createElement(PageHeaderSkeleton))).not.toContain("size-11");
    expect(html(createElement(PageHeaderSkeleton, { icon: true }))).toContain("size-11");
  });

  it("is sized to PageHeader's title and description", () => {
    const out = html(createElement(PageHeaderSkeleton, { filters: 3 }));
    expect(out).toContain("h-[25px]");
    expect(out).toContain("sm:h-[27px]");
    expect(out.match(/h-12 w-28 rounded-full/g)).toHaveLength(3);
  });

  it("has card and tile skeletons in the grids the finished screens use", () => {
    expect(html(createElement(RecordCardsSkeleton, { count: 2 }))).toContain("md:grid-cols-2 2xl:grid-cols-3");
    expect(html(createElement(PictureTileGridSkeleton, { count: 2 }))).toContain("grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4");
  });

  it("Home, the hubs and every other screen have a loading screen", () => {
    for (const path of ["app/(app)/loading.tsx", "app/(app)/counter/loading.tsx", "app/(app)/counter/[area]/loading.tsx"]) {
      expect(read(path)).toContain("export default function");
    }
  });
});

describe("page headers: one system", () => {
  it("one title size on every PageHeader", () => {
    expect(html(createElement(PageHeader, { title: "Repairs" }))).toContain(`class="${PAGE_TITLE_CLASS}"`);
  });

  it("marks the breadcrumb trail Full-mode-only, and Easy mode hides it", () => {
    const out = html(createElement(Breadcrumbs, { items: [{ label: "Repairs", href: "/tickets" }, { label: "New repair" }] }));
    expect(out).toContain('data-breadcrumbs="full-only"');
    expect(html(createElement(Breadcrumbs, { items: [{ label: "A" }], keepInEasyMode: true }))).toContain('data-breadcrumbs="keep"');
    expect(read("app/globals.css")).toContain('[data-touch-workspace="true"] [data-breadcrumbs="full-only"] { display: none; }');
  });
});

describe("phone tab bar", () => {
  it("lights exactly one tab on every screen, money screens under Sell", () => {
    const tabs = phoneTabs("OWNER");
    expect(activeTab(tabs, "/invoices/i1")).toBe("sell");
    expect(activeTab(tabs, "/estimates")).toBe("sell");
    expect(activeTab(tabs, "/appointments")).toBe("repairs");
    expect(activeTab(tabs, "/customers/c1")).toBe("home");
    expect(activeTab(tabs, "/settings")).toBe("home");
    expect(activeTab(tabs, "/inventory/vendors")).toBe("stock");
    expect(activeTab(phoneTabs("TECH"), "/leads/l1")).toBe("customers");
  });

  it("calls the assistant Ask, labels at 12.5px, and still renders without the shell's provider", () => {
    nav.path = "/invoices/i1";
    const out = html(createElement(MobileNavigation, { role: "OWNER" }));
    expect(out).toContain(">Ask</button>");
    expect(out).toContain("text-[12.5px]");
    expect(out).toMatch(/<a href="\/pos" aria-current="page"/);
    expect(out).not.toContain("Assistant");
  });
});

describe("controls row parts", () => {
  it("names the shop on the switcher, with 'All shops' for the combined view", () => {
    const locations = [{ id: "a", name: "Main" }, { id: "b", name: "Northside Kiosk" }];
    expect(html(createElement(LocationSwitcher, { locations, currentId: "all" }))).toContain("All shops");
    const main = html(createElement(LocationSwitcher, { locations, currentId: "a" }));
    expect(main).toContain('aria-label="Shop: Main. Change shop"');
    expect(main).toContain("min-h-12");
  });

  it("says the role in words", () => {
    expect(roleWords("OWNER")).toBe("Owner");
    expect(roleWords("FRONT_DESK")).toBe("Front desk");
    expect(roleWords("TECH")).toBe("Technician");
  });

  it("signs out from the whole Log out row, not only the words in it", () => {
    const menu = read("components/shell/user-menu.tsx");
    expect(menu).toContain("onSelect={() => logout.current?.requestSubmit()}");
    expect(menu).toMatch(/<form ref=\{logout\} action="\/logout" method="post"/);
    // The form lives outside the menu, so closing the menu cannot unmount it mid-submit.
    expect(menu.indexOf("<form ref={logout}")).toBeGreaterThan(menu.indexOf("</DropdownMenu>"));
  });

  it("offers Easy and Full as two clear choices that keep the person on their screen", () => {
    const view = read("components/counter/view-switch.tsx");
    expect(view).toContain("Big boxes, for the counter and phone");
    expect(view).toContain("Every list and table, for the back office");
    expect(read("app/(app)/counter/screen-style-actions.ts")).not.toContain("redirect(");
  });
});

describe("touch sizing reaches portals", () => {
  it("puts the Easy attribute on <html> while the app is mounted, and only in Easy mode", () => {
    const shell = read("components/shell/app-shell.tsx");
    expect(shell).toContain("root.dataset.touchWorkspace = \"true\"");
    expect(shell).toContain("delete root.dataset.touchWorkspace");
    expect(shell).toContain("useTouchRoot(prefs.simple)");
  });

  it("gives menu rows and options the 48px floor in Easy mode", () => {
    expect(read("app/globals.css")).toContain('[data-touch-workspace="true"] :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]) { min-height: 48px; }');
  });

  it("makes the dialog close button 48px at every width", () => {
    const dialog = read("components/ui/dialog.tsx");
    expect(dialog).toMatch(/DialogPrimitive\.Close className="[^"]*size-12/);
    expect(dialog).not.toContain("sm:size-8");
  });
});

describe("toasts", () => {
  it("keeps an error up until it is closed and says what to do", () => {
    expect(errorToastOptions("Could not save")).toMatchObject({ duration: Number.POSITIVE_INFINITY, closeButton: true, description: "Try again. If it keeps happening, reload the page." });
    expect(errorNextStep("Could not switch shop. Try again.")).toBe("If it keeps happening, reload the page.");
    // A caller's own choices win.
    expect(errorToastOptions("x", { duration: 3000, description: "Card declined" })).toMatchObject({ duration: 3000, description: "Card declined" });
  });

  it("wraps toast.error once", () => {
    const original = vi.fn();
    const target = { error: original as never };
    makeErrorsSticky(target);
    makeErrorsSticky(target);
    (target.error as unknown as (m: string) => void)("Could not save");
    expect(original).toHaveBeenCalledOnce();
    expect(original.mock.calls[0][1]).toMatchObject({ duration: Number.POSITIVE_INFINITY });
  });

  it("sits top centre, clear of the tab bar, the Next bars and the Ask button", () => {
    const toaster = read("components/ui/toaster.tsx");
    expect(toaster).toContain('position="top-center"');
    expect(read("app/layout.tsx")).toContain("<AppToaster theme={prefs.theme} />");
    const css = read("app/globals.css");
    expect(css).toMatch(/\[data-close-button\] \{[^}]*width: 48px;[^}]*height: 48px;/);
  });
});

describe("tap feedback and the keyboard", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const anchor = (href: string, target = "") => ({ href, target, hasAttribute: () => false });

  it("starts the top bar only for an in-app link to another screen", () => {
    const origin = "http://localhost:3020";
    expect(isInAppNavigation(click, anchor("/tickets"), `${origin}/counter`, origin)).toBe(true);
    expect(isInAppNavigation(click, anchor("/tickets?status=open"), `${origin}/tickets`, origin)).toBe(true);
    expect(isInAppNavigation(click, anchor("/tickets"), `${origin}/tickets`, origin)).toBe(false);
    expect(isInAppNavigation(click, anchor("https://example.com/"), `${origin}/counter`, origin)).toBe(false);
    expect(isInAppNavigation(click, anchor("/tickets", "_blank"), `${origin}/counter`, origin)).toBe(false);
    expect(isInAppNavigation({ ...click, metaKey: true }, anchor("/tickets"), `${origin}/counter`, origin)).toBe(false);
  });

  it("renders a tile's pending mark even where next/link is mocked without useLinkStatus", () => {
    expect(html(createElement(LinkPending))).toContain('aria-hidden="true"');
  });

  it("only auto-focuses with a mouse or trackpad (never on the server)", () => {
    expect(prefersFinePointer()).toBe(false);
    expect(SEARCH_INPUT_PROPS).toMatchObject({ type: "search", enterKeyHint: "search" });
  });

  it("lets fixed bars ride above the on-screen keyboard", () => {
    expect(read("app/layout.tsx")).toContain('interactiveWidget: "resizes-content"');
  });
});

describe("dead shell code is gone", () => {
  it.each(["components/shell/topbar.tsx", "components/shell/sidebar.tsx", "components/shell/nav-links.tsx", "components/shell/new-menu.tsx", "components/shell/nav-items.ts", "components/search/search-trigger.tsx", "components/counter/simple-mode-button.tsx"])("%s", (path) => {
    expect(() => read(path)).toThrow();
  });
});
