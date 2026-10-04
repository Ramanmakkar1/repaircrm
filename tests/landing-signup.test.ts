import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinalCta, SignupEmail } from "@/components/landing/final-cta";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("email sign-up form (final call to action)", () => {
  const out = html(React.createElement(SignupEmail, { id: "footer-email" }));

  it("is still a plain GET form to /signup with one field called email", () => {
    const form = out.match(/<form[^>]*>/)![0];
    expect(form).toContain('action="/signup"');
    expect(form).toContain('method="get"');
    const input = out.match(/<input[^>]*>/)![0];
    expect(input).toContain('name="email"');
    expect(input).toContain('type="email"');
    expect(input).toContain('autoComplete="email"');
    expect(input).toContain("required");
    expect(input).toContain('id="footer-email"');
    expect(out.match(/<input/g)).toHaveLength(1);
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*>Start free/);
  });

  it("has a real label for the field and a 44px touch target", () => {
    expect(out).toMatch(/<label[^>]*for="footer-email"[^>]*>Your shop’s email<\/label>/);
    expect(out).toContain("sr-only");
    expect(out).toContain("min-h-11");
    expect(out).toContain('placeholder="Your shop’s email"');
  });

  it("sits in the last section of the page", () => {
    const cta = html(React.createElement(FinalCta));
    expect(cta).toContain("Start with your");
    expect(cta).toMatch(/<form[^>]*action="\/signup"[^>]*method="get"/);
    expect(cta).toContain("Free during early access");
    expect(cta).toContain("No card needed");
  });

  it("is still read by the sign-up page, which pre-fills its email box from ?email=", () => {
    const page = readFileSync(new URL("../app/(auth)/signup/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/searchParams:\s*Promise<\{[^}]*email\?:\s*string/);
    expect(page).toContain("email?.slice(0, 254)");
  });
});
