import { PAYMENT_METHOD_LABELS, type ReceiptDto } from "@smartdine/shared";

import { RECEIPT_COLUMNS } from "./pdf";

const COLS = RECEIPT_COLUMNS;

export const formatAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const center = (text: string) => text.padStart(Math.floor((COLS + text.length) / 2)).slice(0, COLS);
const rule = (ch = "-") => ch.repeat(COLS);

/** "label ........ value" on one line; the label is shortened if the pair would not fit. */
function pair(label: string, value: string): string {
  const room = COLS - value.length - 1;
  const left = label.length > room ? `${label.slice(0, Math.max(0, room - 1))}~` : label;
  return `${left}${" ".repeat(Math.max(1, COLS - left.length - value.length))}${value}`;
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The receipt as fixed-width text, shared by the PDF and any plain-text export. */
export function receiptLines(r: ReceiptDto, timezone: string): string[] {
  const money = (n: number) => formatAmount(n);
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(r.issuedAt));

  const lines: string[] = [center(r.company.toUpperCase()), center(r.branch.name)];
  for (const part of [r.branch.address, r.branch.phone, r.branch.email]) {
    if (part) lines.push(...wrap(part, COLS).map(center));
  }
  lines.push(rule("="), pair("Receipt", r.receiptNumber), pair("Bill", r.billNumber));
  lines.push(pair("Order", r.orderNumber), pair(r.location, when));
  lines.push(pair("Cashier", r.cashierName), pair("Waiter", r.waiterName));
  if (r.guestName) lines.push(pair("Guest", r.guestName));
  lines.push(rule());

  for (const item of r.lines) {
    lines.push(pair(`${item.quantity} x ${item.name}`, money(item.lineTotal)));
    if (item.modifiers.length)
      lines.push(...wrap(`+ ${item.modifiers.join(", ")}`, COLS - 4).map((l) => `    ${l}`));
  }
  lines.push(rule(), pair("Subtotal", money(r.subtotal)));
  if (r.discountAmount > 0) lines.push(pair("Discount", `-${money(r.discountAmount)}`));
  if (r.serviceChargeAmount > 0)
    lines.push(pair(`Service charge ${r.serviceChargePercent}%`, money(r.serviceChargeAmount)));
  if (r.taxAmount > 0) lines.push(pair(`Tax ${r.taxPercent}%`, money(r.taxAmount)));
  lines.push(rule("="), pair(`TOTAL ${r.currency}`, money(r.total)), rule("="));

  for (const p of r.payments) {
    lines.push(pair(PAYMENT_METHOD_LABELS[p.method], money(p.amount)));
    if (p.tendered !== null) lines.push(pair("  Tendered", money(p.tendered)));
    if (p.change) lines.push(pair("  Change", money(p.change)));
    if (p.reference) lines.push(`  Ref: ${p.reference}`.slice(0, COLS));
  }
  if (r.refundedAmount > 0) lines.push(rule(), pair("Refunded", `-${money(r.refundedAmount)}`));
  if (r.footer) lines.push(rule(), ...wrap(r.footer, COLS).map(center));
  lines.push("", center("Thank you for dining with us"));
  return lines;
}
