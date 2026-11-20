import { apiDownload } from "@/services/api/client";

/** Downloads the PDF receipt through the authenticated API (a plain link would carry no token). */
export async function downloadReceiptPdf(
  id: string,
  filename: string,
  base: "/receipts" | "/customers/me/receipts" = "/receipts",
) {
  const blob = await apiDownload(`${base}/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
