import type { ReportDto } from "@smartdine/shared";
import { describe, expect, it } from "vitest";

import { buildPagedPdf, csvCell, reportPages, reportToCsv } from "./report.render";

const report = (overrides: Partial<ReportDto> = {}): ReportDto => ({
  type: "sales",
  title: "Sales",
  subtitle: "Colombo · 2026-11-01 to 2026-11-07",
  currency: "LKR",
  from: "2026-11-01",
  to: "2026-11-07",
  group: "day",
  columns: [
    { key: "name", label: "Name", format: "text" },
    { key: "amount", label: "Amount", format: "money" },
    { key: "share", label: "Share", format: "percent" },
    { key: "count", label: "Count", format: "number" },
  ],
  rows: [{ name: "Ada", amount: 1234.5, share: 12.34, count: 3 }],
  totals: { name: "Total", amount: 1234.5, share: null, count: 3 },
  truncated: false,
  generatedAt: "2026-11-07T10:00:00.000Z",
  ...overrides,
});

describe("csvCell", () => {
  it("quotes cells with commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  it("neutralises anything a spreadsheet would run as a formula", () => {
    for (const evil of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1"]) {
      expect(csvCell(evil).startsWith("'") || csvCell(evil).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("writes real numbers as numbers — a negative figure is not a formula", () => {
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(1234.5, { key: "a", label: "A", format: "money" })).toBe("1234.50");
    expect(csvCell(12.34, { key: "a", label: "A", format: "percent" })).toBe("12.3");
  });
});

describe("reportToCsv", () => {
  it("has a BOM, a header, the rows and the totals", () => {
    const csv = reportToCsv(report());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Name,Amount,Share,Count",
      "Ada,1234.50,12.3,3",
      "Total,1234.50,,3",
      "",
    ]);
  });

  it("omits the totals row when a report has none", () => {
    expect(
      reportToCsv(report({ totals: null }))
        .trim()
        .split("\r\n"),
    ).toHaveLength(2);
  });
});

describe("PDF export", () => {
  it("lays out a title, a header, the rows and the totals", () => {
    const [page] = reportPages(report());
    expect(page![0]).toBe("Sales");
    expect(page!.some((l) => /Name\s+Amount\s+Share\s+Count/.test(l))).toBe(true);
    expect(page!.some((l) => /Ada\s+1,234\.50\s+12\.3%\s+3/.test(l))).toBe(true);
    expect(page!.at(-1)).toMatch(/Total\s+1,234\.50\s+3/);
  });

  it("spreads a long report over several pages, repeating the header on each", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      name: `Row ${i}`,
      amount: i,
      share: 1,
      count: i,
    }));
    const pages = reportPages(report({ rows }));
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) expect(page.some((l) => /Name\s+Amount/.test(l))).toBe(true);
    expect(pages.flat().filter((l) => l.startsWith("Row ")).length).toBe(120);
  });

  it("never lets a very wide report run off the page", () => {
    const wide = report({
      columns: Array.from({ length: 12 }, (_, i) => ({
        key: `c${i}`,
        label: `Column ${i}`,
        format: "text" as const,
      })),
      rows: [Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, "x".repeat(40)]))],
      totals: null,
    });
    const widest = Math.max(
      ...reportPages(wide)
        .flat()
        .map((l) => l.length),
    );
    expect(widest).toBeLessThanOrEqual(163);
  });

  it("says when the list was cut short", () => {
    expect(
      reportPages(report({ truncated: true }))
        .flat()
        .join("\n"),
    ).toContain("List cut short");
  });

  it("builds a valid multi-page PDF whose xref offsets point at the objects", () => {
    const pdf = buildPagedPdf([
      ["page one"],
      ["page two"],
      ["page three (with parentheses)"],
    ]).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(pdf).toContain("/Count 3");
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(3 * 2 + 3); // catalog, pages, font, then a page and content per page
    offsets.forEach((offset, i) =>
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`),
    );
    expect(pdf).toContain("(page three \\(with parentheses\\)) '");
  });
});
