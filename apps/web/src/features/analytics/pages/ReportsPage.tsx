import {
  OWNER_ONLY_REPORTS,
  REPORT_GROUPS,
  REPORT_LABELS,
  REPORT_TYPES,
  type ReportCell,
  type ReportColumn,
  type ReportGroup,
  type ReportType,
} from "@smartdine/shared";
import { Download, FileText } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useBranches } from "@/features/branches/api/branchQueries";
import { useCurrentBranch } from "@/features/branches/hooks/useCurrentBranch";
import { useBranchStore } from "@/stores/branchStore";
import { formatMoney } from "@/utils/format";

import { downloadReport, useReport, type ReportQuery } from "../api/analyticsQueries";

const GROUPED: ReportType[] = ["sales", "reservations"];
const NO_DATES: ReportType[] = ["inventory"];

function cell(value: ReportCell, column: ReportColumn, currency: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (column.format === "money") return formatMoney(value, currency);
  if (column.format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function ReportsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const branches = useBranches();
  const { branchId: working } = useCurrentBranch();
  const selected = useBranchStore((s) => s.selectedBranchId);
  const [type, setType] = useState<ReportType>("sales");
  const [group, setGroup] = useState<ReportGroup>("day");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchChoice, setBranchChoice] = useState<string>(selected ?? "");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const query: ReportQuery = {
    type,
    group,
    branchId: isOwner ? branchChoice || undefined : working,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isPending, isError, error, refetch, isFetching } = useReport(query);
  const types = REPORT_TYPES.filter((t) => isOwner || !OWNER_ONLY_REPORTS.includes(t));

  const run = async (format: "csv" | "pdf") => {
    setExportError(null);
    setExporting(format);
    try {
      await downloadReport(
        query,
        format,
        `${type}-${data?.from ?? "report"}-to-${data?.to ?? ""}.${format}`,
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Couldn't export the report.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Pick a report and a period. Leave the dates empty for the last 30 days."
        actions={
          <>
            <Button
              variant="outline"
              disabled={!data || exporting !== null}
              onClick={() => void run("csv")}
            >
              <Download className="size-4" aria-hidden />{" "}
              {exporting === "csv" ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              variant="outline"
              disabled={!data || exporting !== null}
              onClick={() => void run("pdf")}
            >
              <FileText className="size-4" aria-hidden />{" "}
              {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </Button>
          </>
        }
      />
      <form
        aria-label="Report options"
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <SelectField
          label="Report"
          value={type}
          onChange={(e) => setType(e.target.value as ReportType)}
          options={types.map((t) => ({ value: t, label: REPORT_LABELS[t] }))}
        />
        {isOwner && !OWNER_ONLY_REPORTS.includes(type) && (
          <SelectField
            label="Branch"
            value={branchChoice}
            placeholder="All branches"
            onChange={(e) => setBranchChoice(e.target.value)}
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        {!NO_DATES.includes(type) && (
          <>
            <TextField
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <TextField
              label="To"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        {GROUPED.includes(type) && (
          <SelectField
            label="Group by"
            value={group}
            onChange={(e) => setGroup(e.target.value as ReportGroup)}
            options={REPORT_GROUPS.map((g) => ({
              value: g,
              label: g === "day" ? "Day" : g === "week" ? "Week" : "Month",
            }))}
          />
        )}
      </form>
      <FormError message={exportError} />

      {isPending && <ListSkeleton rows={5} />}
      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : "Couldn't build the report."}
          onRetry={() => void refetch()}
        />
      )}
      {data && (
        <section aria-label={data.title} aria-busy={isFetching} className="space-y-2">
          <div>
            <h2 className="font-display text-xl font-semibold">{data.title}</h2>
            <p className="text-sm text-muted-foreground" role="status">
              {data.subtitle} · {data.rows.length} {data.rows.length === 1 ? "row" : "rows"}
            </p>
          </div>
          {data.truncated && (
            <p role="alert" className="rounded-md bg-warning/20 p-2.5 text-sm">
              Only the first {data.rows.length.toLocaleString()} rows are shown. Narrow the dates to
              see everything.
            </p>
          )}
          {data.rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nothing in this period"
              text="Try a wider date range or a different report."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{data.title}</caption>
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={`p-3 font-medium ${rightAligned(c) ? "text-right" : ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {data.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`p-3 ${rightAligned(c) ? "text-right tabular-nums" : ""}`}
                        >
                          {cell(row[c.key] ?? null, c, data.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot className="border-t-2 border-border font-semibold">
                    <tr>
                      {data.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`p-3 ${rightAligned(c) ? "text-right tabular-nums" : ""}`}
                        >
                          {data.totals![c.key] === null || data.totals![c.key] === undefined
                            ? ""
                            : cell(data.totals![c.key]!, c, data.currency)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const rightAligned = (c: ReportColumn) =>
  c.format === "money" || c.format === "number" || c.format === "percent";
