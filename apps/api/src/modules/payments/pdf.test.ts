import { describe, expect, it } from "vitest";

import { buildTextPdf } from "./pdf";

describe("buildTextPdf", () => {
  it("writes a well-formed single-page document whose xref offsets point at the objects", () => {
    const pdf = buildTextPdf(["SMARTDINE", "Total 1,732.50"]);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => {
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("escapes parentheses and backslashes and replaces characters outside Latin-1", () => {
    const text = buildTextPdf(["a (b) \\ c", "snow ☃ man"]).toString("latin1");
    expect(text).toContain("(a \\(b\\) \\\\ c) '");
    expect(text).toContain("(snow ? man) '");
  });

  it("sizes the page to its content", () => {
    const short = buildTextPdf(["x"]).toString("latin1");
    const long = buildTextPdf(Array.from({ length: 100 }, (_, i) => `line ${i}`)).toString(
      "latin1",
    );
    const height = (t: string) => Number(/MediaBox \[0 0 \d+ (\d+)\]/.exec(t)![1]);
    expect(height(long)).toBeGreaterThan(height(short));
  });
});
