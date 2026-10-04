import { describe, expect, it, vi } from "vitest";

import { csvCell as plainCsvCell, neutralizeFormula, toCsv } from "@/lib/csv";

/**
 * CSV formula injection.
 *
 * Customer names, part names and notes come from people and from imported
 * spreadsheets, and the accounting exports are opened in Excel. A cell that
 * starts with = + - @ (or a tab / carriage return) runs as a formula there, so
 * the exports prefix such TEXT with a single quote. Real numbers — above all the
 * negative amounts on a refund line — must stay numbers.
 */

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
const { csvAmount, csvBody, csvCell, csvResponse } = await import("@/app/api/exports/_lib/csv");

describe("neutralizeFormula", () => {
  it.each([
    ["=HYPERLINK(\"http://evil.example\",\"Click\")", "'=HYPERLINK(\"http://evil.example\",\"Click\")"],
    ["=1+1", "'=1+1"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3", "'-2+3"],
    ["-cmd|' /C calc'!A0", "'-cmd|' /C calc'!A0"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", "'\r=1+1"],
    ["-", "'-"],
    ["-5 apples", "'-5 apples"],
  ])("defuses text that starts like a formula: %j", (input, expected) => {
    expect(neutralizeFormula(input)).toBe(expected);
  });

  it.each(["Nguyen, Minh", "Screen guard", "", "5-star", "a=b", "x@y.com", "12/25/2026", "1284.50"])(
    "leaves ordinary text alone: %j",
    (input) => {
      expect(neutralizeFormula(input)).toBe(input);
    },
  );

  it("leaves genuine numbers alone, including negative ones", () => {
    expect(neutralizeFormula(-5)).toBe("-5");
    expect(neutralizeFormula(-3.2)).toBe("-3.2");
    expect(neutralizeFormula(0)).toBe("0");
    // Text that is only a number — what csvAmount() returns — is judged by shape.
    expect(neutralizeFormula("-5")).toBe("-5");
    expect(neutralizeFormula("-3.20")).toBe("-3.20");
    expect(neutralizeFormula("-1284.50")).toBe("-1284.50");
    expect(neutralizeFormula("+7")).toBe("+7");
  });

  it("treats missing values as empty", () => {
    expect(neutralizeFormula(null)).toBe("");
    expect(neutralizeFormula(undefined)).toBe("");
  });
});

describe("the accounting export writer", () => {
  it("quotes every field and defuses a formula in a customer name", () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toBe(`"'=cmd|' /C calc'!A0"`);
    expect(csvCell("Nguyen, Minh")).toBe('"Nguyen, Minh"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("keeps negative amounts as numbers, whether they arrive as numbers or as csvAmount() text", () => {
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell(csvAmount(-500))).toBe('"-5.00"');
    expect(csvCell(csvAmount(-320))).toBe('"-3.20"');
    expect(csvCell(csvAmount(128450))).toBe('"1284.50"');
  });

  it("defuses text in a whole export body and leaves its numbers intact", () => {
    const body = csvBody([
      ["Customer", "Note", "Balance", "Net"],
      ["=SUM(1+1)", "@here", csvAmount(-1250), -2],
    ]);
    const [header, row] = body.replace("﻿", "").trim().split("\r\n");
    expect(header).toBe('"Customer","Note","Balance","Net"');
    expect(row).toBe(`"'=SUM(1+1)","'@here","-12.50","-2"`);
  });

  it("applies to every download built with csvResponse", async () => {
    const response = csvResponse([["+evil"], ["fine"]], "x.csv");
    expect((await response.text()).replace("﻿", "")).toBe(`"'+evil"\r\n"fine"\r\n`);
  });
});

describe("the importer's own CSV helpers", () => {
  it("are unchanged, because the importer round-trips header text through them", () => {
    expect(plainCsvCell("-")).toBe("-");
    expect(toCsv([["=Price", "-", "Qty"]])).toBe("=Price,-,Qty");
  });
});
