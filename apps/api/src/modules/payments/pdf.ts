/**
 * A tiny single-page PDF writer for text receipts. Receipts are monospaced columns of text, so a
 * hand-built document with the standard Courier font is enough — no dependency, no font files, and
 * it bundles cleanly.
 */

const FONT_SIZE = 9;
const LEADING = 12;
const MARGIN = 28;
const WIDTH = 226; // ≈ 80 mm thermal paper in points

/** Standard fonts use WinAnsi: keep Latin-1 and replace everything else. */
const sanitize = (line: string) =>
  [...line].map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255 ? ch : "?")).join("");

const escapePdf = (text: string) =>
  sanitize(text).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

export function buildTextPdf(lines: string[]): Buffer {
  const height = Math.max(200, MARGIN * 2 + lines.length * LEADING);
  const text = [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LEADING} TL`,
    `${MARGIN} ${height - MARGIN} Td`,
    ...lines.map((line) => `(${escapePdf(line)}) '`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH + MARGIN * 2} ${height}] ` +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, "latin1");
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** Characters that fit across the receipt at the chosen font size. */
export const RECEIPT_COLUMNS = 36;
