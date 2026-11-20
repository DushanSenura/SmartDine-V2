import type { DashboardDto, ReportDto, ReportGroup, ReportType } from "@smartdine/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiDownload, apiRequest } from "@/services/api/client";

export function useDashboard(branchId: string | undefined, days: number) {
  const params = new URLSearchParams({ days: String(days) });
  if (branchId) params.set("branchId", branchId);
  return useQuery({
    queryKey: ["analytics", "dashboard", branchId ?? "all", days],
    queryFn: ({ signal }) => apiRequest<DashboardDto>(`/analytics/dashboard?${params}`, { signal }),
    placeholderData: keepPreviousData,
    // Takings move all day; a quiet refresh keeps the screen honest without anyone reloading.
    refetchInterval: 60_000,
  });
}

export interface ReportQuery {
  type: ReportType;
  branchId?: string;
  from?: string;
  to?: string;
  group: ReportGroup;
}

const reportParams = (q: ReportQuery, format?: "csv" | "pdf") => {
  const params = new URLSearchParams({ group: q.group });
  if (q.branchId) params.set("branchId", q.branchId);
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (format) params.set("format", format);
  return params.toString();
};

export function useReport(query: ReportQuery) {
  return useQuery({
    queryKey: ["analytics", "report", query],
    queryFn: ({ signal }) =>
      apiRequest<ReportDto>(`/reports/${query.type}?${reportParams(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Downloads an export through the authenticated API (a plain link would carry no token). */
export async function downloadReport(query: ReportQuery, format: "csv" | "pdf", filename: string) {
  const blob = await apiDownload(`/reports/${query.type}?${reportParams(query, format)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
