import type { ReportCell, ReportColumn, ReportDto } from "@smartdine/shared";

// ── CSV ───────────────────────────────────────────────────────────

/**
 * A cell that starts with = + - @ is read as a formula by spreadsheet programs, which lets a guest's
 * name or a note run code on whoever opens the export. Prefixing an apostrophe makes it plain text.
 * Real numbers are written as numbers and never touched.
 */
export function csvCell(value: ReportCell, column?: ReportColumn): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number") {
    text =
      column?.format === "money" || column?.format === "percent"
        ? value.toFixed(column.format === "money" ? 2 : 1)
        : String(value);
  } else {
    text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const BOM = String.fromCharCode(0xfeff);

export function reportToCsv(report: ReportDto): string {
  const header = report.columns.map((c) => csvCell(c.label));
  const lines = [header.join(",")];
  for (const row of report.rows)
    lines.push(report.columns.map((c) => csvCell(row[c.key] ?? null, c)).join(","));
  if (report.totals) {
    const totals = report.totals;
    lines.push(report.columns.map((c) => csvCell(totals[c.key] ?? null, c)).join(","));
  }
  // The BOM lets Excel read non-ASCII names correctly.
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

// ── PDF ───────────────────────────────────────────────────────────

const PAGE = { width: 842, height: 595, margin: 28, fontSize: 8, leading: 10 }; // A4 landscape, Courier 8 pt
const CHAR_WIDTH = PAGE.fontSize * 0.6;
const MAX_COLUMNS = Math.floor((PAGE.width - PAGE.margin * 2) / CHAR_WIDTH);
const LINES_PER_PAGE = Math.floor((PAGE.height - PAGE.margin * 2) / PAGE.leading);

const sanitize = (line: string) =>
  [...line].map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255 ? ch : "?")).join("");
const escapePdf = (text: string) =>
  sanitize(text).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

function formatCell(value: ReportCell, column: ReportColumn): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (column.format === "money")
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (column.format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** The report as fixed-width text lines, wrapped across as many pages as it needs. */
export function reportPages(report: ReportDto): string[][] {
  const rightAlign = (c: ReportColumn) =>
    c.format === "money" || c.format === "number" || c.format === "percent";
  const cells = (row: Record<string, ReportCell>) =>
    report.columns.map((c) => formatCell(row[c.key] ?? null, c));
  const body = report.rows.map(cells);
  const totals = report.totals ? cells(report.totals) : null;

  // Column widths from the content, then squeezed to fit the page (long text columns give way first).
  const widths = report.columns.map((c, i) =>
    Math.min(
      32,
      Math.max(c.label.length, ...body.map((r) => r[i]!.length), totals?.[i]?.length ?? 0),
    ),
  );
  const gaps = (report.columns.length - 1) * 2;
  let over = sum(widths) + gaps - MAX_COLUMNS;
  while (over > 0) {
    const widest = widths.indexOf(Math.max(...widths));
    if (widths[widest]! <= 6) break;
    widths[widest]! -= 1;
    over -= 1;
  }
  const fit = (text: string, width: number, right: boolean) => {
    const t = text.length > width ? `${text.slice(0, Math.max(0, width - 1))}~` : text;
    return right ? t.padStart(width) : t.padEnd(width);
  };
  const line = (values: string[]) =>
    report.columns.map((c, i) => fit(values[i]!, widths[i]!, rightAlign(c))).join("  ");

  const header = line(report.columns.map((c) => c.label));
  const rule = "-".repeat(Math.min(MAX_COLUMNS, header.length));
  const title = [
    report.title,
    report.subtitle,
    `Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
  ];
  const rowLines = body.map(line);
  if (totals) rowLines.push(rule, line(totals));
  if (report.truncated) rowLines.push("", "(List cut short: narrow the dates to see everything.)");

  const pages: string[][] = [];
  let current: string[] = [...title, header, rule];
  const head = [header, rule];
  for (const text of rowLines) {
    if (current.length >= LINES_PER_PAGE) {
      pages.push(current);
      current = [...head];
    }
    current.push(text);
  }
  pages.push(current);
  return pages;
}

const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

/** A multi-page A4-landscape PDF of fixed-width text (standard Courier, no font files or dependencies). */
export function buildPagedPdf(pages: string[][]): Buffer {
  const objects: string[] = [
    "",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];
  const kids: number[] = [];
  for (const lines of pages) {
    const stream = [
      "BT",
      `/F1 ${PAGE.fontSize} Tf`,
      `${PAGE.leading} TL`,
      `${PAGE.margin} ${PAGE.height - PAGE.margin - PAGE.fontSize} Td`,
      ...lines.map((l) => `(${escapePdf(l)}) '`),
      "ET",
    ].join("\n");
    const content = objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    const page = objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`,
    );
    kids.push(page);
  }
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export const reportToPdf = (report: ReportDto) => buildPagedPdf(reportPages(report));
