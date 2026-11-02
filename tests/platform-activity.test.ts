import { describe, expect, it } from "vitest";

import {
  ACTIVITY_SOURCES,
  IMPORTANT_ACTIONS,
  SIGN_IN_ACTIONS,
  activityPlan,
  afterCursorWhere,
  auditToActivity,
  classifyAuditAction,
  compareActivity,
  decodeCursor,
  encodeCursor,
  feedbackToActivity,
  mergeActivity,
  parseActivityFilter,
  signupToActivity,
  type ActivityCursor,
  type ActivityItem,
  type ActivitySource,
} from "@/lib/platform-activity";

const at = (iso: string) => new Date(iso);

function audit(id: string, iso: string, action = "user.login"): ActivityItem {
  return auditToActivity({
    id,
    action,
    summary: "Signed in",
    createdAt: at(iso),
    shop: { id: "shop_1", name: "Demo" },
    user: { name: "Dana" },
  });
}

describe("what kind of event", () => {
  it("treats password, Google and PIN sign-ins as sign-ins", () => {
    for (const action of SIGN_IN_ACTIONS) expect(classifyAuditAction(action)).toBe("signin");
  });

  it("flags money reversed, records deleted and access changes as important", () => {
    for (const action of ["invoice.voided", "invoice.refunded", "ticket.deleted", "user.role_changed", "shop.deletion_requested", "user.login_locked"]) {
      expect(classifyAuditAction(action)).toBe("important");
    }
    expect(IMPORTANT_ACTIONS).not.toContain("user.login");
  });

  it("files everything else, including actions added later, as an ordinary change", () => {
    expect(classifyAuditAction("settings.updated")).toBe("other");
    expect(classifyAuditAction("user.logout")).toBe("other");
    expect(classifyAuditAction("something.new_next_year")).toBe("other");
  });

  it("reads only the sources a filter needs", () => {
    expect(activityPlan("all")).toEqual({ shops: true, feedback: true, audit: null });
    expect(activityPlan("signup")).toEqual({ shops: true, feedback: false, audit: false });
    expect(activityPlan("signin")).toEqual({ shops: false, feedback: false, audit: SIGN_IN_ACTIONS });
    expect(activityPlan("important")).toEqual({ shops: false, feedback: false, audit: IMPORTANT_ACTIONS });
    expect(activityPlan("feedback")).toEqual({ shops: false, feedback: true, audit: false });
  });

  it("falls back to everything for an unknown filter", () => {
    expect(parseActivityFilter("important")).toBe("important");
    expect(parseActivityFilter(["signin", "all"])).toBe("signin");
    expect(parseActivityFilter("delete")).toBe("all");
    expect(parseActivityFilter(undefined)).toBe("all");
  });
});

describe("wording", () => {
  it("says who signed up, and links to the shop", () => {
    const item = signupToActivity({ id: "s1", name: "Alpha", createdAt: at("2026-10-01T00:00:00Z"), owner: { name: "Dana", email: "dana@a.example" } });
    expect(item).toMatchObject({ kind: "signup", title: "New shop signed up: Alpha", actor: "Dana (dana@a.example)", href: "/platform/shops/s1" });
    expect(signupToActivity({ id: "s2", name: "Beta", createdAt: at("2026-10-01T00:00:00Z"), owner: null }).actor).toBeNull();
  });

  it("names the kind of feedback and points at the inbox", () => {
    expect(feedbackToActivity({ id: "f1", kind: "BUG", title: "Till froze", createdAt: at("2026-10-01T00:00:00Z") })).toMatchObject({
      kind: "feedback",
      title: "Bug report: Till froze",
      href: "/platform/feedback",
    });
    expect(feedbackToActivity({ id: "f2", kind: "WHATEVER", title: "Hi", createdAt: at("2026-10-01T00:00:00Z") }).title).toBe("Feedback: Hi");
  });

  it("keeps the shop's own summary and who did it", () => {
    expect(audit("a1", "2026-10-01T00:00:00Z", "invoice.voided")).toMatchObject({
      kind: "important",
      title: "Signed in",
      actor: "Dana",
      shop: { id: "shop_1", name: "Demo" },
    });
  });
});

describe("cursor", () => {
  it("round-trips and refuses anything that is not one", () => {
    const item = audit("ckabc123", "2026-10-02T03:04:05.678Z");
    expect(decodeCursor(encodeCursor(item))).toEqual({ at: item.at, source: "audit", id: "ckabc123" });
    for (const bad of ["", "abc", "123.audit", "123.users.x", "123.audit.x;drop", "1.audit." + "x".repeat(65)]) {
      expect(decodeCursor(bad)).toBeNull();
    }
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("asks each source only for rows after the cursor in feed order", () => {
    const cursor: ActivityCursor = { at: at("2026-10-02T00:00:00Z"), source: "feedback", id: "f5" };
    // "shop" sorts before "feedback" at the same millisecond, so its rows at that instant were already shown.
    expect(afterCursorWhere("shop", cursor)).toEqual({ createdAt: { lt: cursor.at } });
    expect(afterCursorWhere("audit", cursor)).toEqual({ createdAt: { lte: cursor.at } });
    expect(afterCursorWhere("feedback", cursor)).toEqual({
      OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: "f5" } }],
    });
    expect(afterCursorWhere("audit", null)).toBeUndefined();
  });
});

/** A source as the database would serve it: newest first, filtered by the cursor condition. */
function serve(items: readonly ActivityItem[], source: ActivitySource, cursor: ActivityCursor | null, take: number): ActivityItem[] {
  const where = afterCursorWhere(source, cursor);
  const keep = (item: ActivityItem) => {
    if (!where) return true;
    if ("OR" in where) {
      return item.at < where.OR[0].createdAt.lt || (item.at.getTime() === where.OR[1].createdAt.getTime() && item.sourceId < where.OR[1].id.lt);
    }
    return "lt" in where.createdAt ? item.at < where.createdAt.lt : item.at <= where.createdAt.lte;
  };
  return items
    .filter((item) => item.source === source && keep(item))
    .sort(compareActivity)
    .slice(0, take);
}

describe("merging and paging", () => {
  it("puts the newest first and breaks same-moment ties by source, then id", () => {
    const same = "2026-10-05T10:00:00.000Z";
    const shop = signupToActivity({ id: "s1", name: "A", createdAt: at(same), owner: null });
    const feedback = feedbackToActivity({ id: "f1", kind: "BUG", title: "x", createdAt: at(same) });
    const older = audit("a9", "2026-10-04T10:00:00.000Z");
    const auditB = audit("b2", same);
    const auditA = audit("a1", same);
    const { items, next } = mergeActivity([[shop], [feedback], [auditA, auditB, older]], 10);
    expect(items.map((item) => item.id)).toEqual(["shop-s1", "feedback-f1", "audit-b2", "audit-a1", "audit-a9"]);
    expect(next).toBeNull();
    expect(ACTIVITY_SOURCES).toEqual(["shop", "feedback", "audit"]);
  });

  it("offers a next page only when there is more", () => {
    const rows = [audit("a1", "2026-10-03T00:00:00Z"), audit("a2", "2026-10-02T00:00:00Z"), audit("a3", "2026-10-01T00:00:00Z")];
    expect(mergeActivity([rows], 3).next).toBeNull();
    const page = mergeActivity([rows], 2);
    expect(page.items.map((item) => item.sourceId)).toEqual(["a1", "a2"]);
    expect(page.next).toBe(encodeCursor(rows[1]));
  });

  it("walks every page without dropping or repeating a row, even with many rows at one instant", () => {
    const instant = "2026-10-10T12:00:00.000Z";
    const all: ActivityItem[] = [
      ...Array.from({ length: 4 }, (_, i) => signupToActivity({ id: `s${i}`, name: `S${i}`, createdAt: at(i < 2 ? instant : "2026-10-09T00:00:00Z"), owner: null })),
      ...Array.from({ length: 5 }, (_, i) => feedbackToActivity({ id: `f${i}`, kind: "OTHER", title: `F${i}`, createdAt: at(i % 2 ? instant : "2026-10-11T00:00:00Z") })),
      ...Array.from({ length: 9 }, (_, i) => audit(`a${i}`, i < 6 ? instant : `2026-10-0${i - 5}T00:00:00Z`)),
    ];
    const seen: string[] = [];
    let cursor: ActivityCursor | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const lists = ACTIVITY_SOURCES.map((source) => serve(all, source, cursor, 3 + 1));
      const page = mergeActivity(lists, 3);
      seen.push(...page.items.map((item) => item.id));
      if (!page.next) break;
      cursor = decodeCursor(page.next);
    }
    expect(seen).toEqual([...all].sort(compareActivity).map((item) => item.id));
    expect(new Set(seen).size).toBe(all.length);
  });
});
