import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { niceMax, type Datum } from "./chartMath";

/**
 * A chart with its title, a plain description, and a table view of the very same numbers — so the
 * data never depends on seeing colour or using a pointer.
 */
export function ChartCard({
  title,
  description,
  data,
  valueLabel,
  categoryLabel = "Item",
  format,
  children,
}: {
  title: string;
  description?: string;
  data: Datum[];
  valueLabel: string;
  /** Heading of the first table column, e.g. "Day". */
  categoryLabel?: string;
  format: (n: number) => string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted"
        >
          {asTable ? "Show chart" : "View as table"}
        </button>
      </header>
      {asTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">{categoryLabel}</th>
                <th className="py-1.5 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-border last:border-0">
                  <td className="py-1.5">{d.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

const W = 640;
const H = 220;
const M = { top: 12, right: 8, bottom: 26, left: 44 };

function Grid({ max, format }: { max: number; format: (n: number) => string }) {
  const ticks = [0, 0.5, 1];
  return (
    <g aria-hidden>
      {ticks.map((t) => {
        const y = M.top + (H - M.top - M.bottom) * (1 - t);
        return (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
            <text
              x={M.left - 6}
              y={y + 3.5}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {format(max * t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Tooltip({ x, label, value }: { x: number; label: string; value: string }) {
  const left = Math.min(88, Math.max(12, (x / W) * 100));
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `${left}%` }}
    >
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Thin bars on a shared baseline, rounded only at the data end; a tooltip on hover or focus. */
export function VerticalBars({
  data,
  format,
  ariaLabel,
  labelEvery = 1,
}: {
  data: Datum[];
  format: (n: number) => string;
  ariaLabel: string;
  /** Show every nth category label so long axes stay legible. */
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = (W - M.left - M.right) / Math.max(1, data.length);
  const bar = Math.min(28, band * 0.62);
  const plotH = H - M.top - M.bottom;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {hover !== null && data[hover] && (
        <Tooltip
          x={M.left + band * (hover + 0.5)}
          label={data[hover]!.label}
          value={format(data[hover]!.value)}
        />
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="mt-6 w-full">
        <Grid max={max} format={format} />
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plotH);
          const x = M.left + band * i + (band - bar) / 2;
          const y = M.top + plotH - h;
          const r = Math.min(4, h, bar / 2);
          return (
            <g key={d.label}>
              {/* A hit area wider than the mark itself. */}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${format(d.value)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none focus-visible:stroke-primary"
              />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${y + h} Z`}
                  className={cn(
                    "fill-primary transition-opacity",
                    hover !== null && hover !== i && "opacity-60",
                  )}
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={x + bar / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A single 2px line with a point marker and a crosshair tooltip. */
export function LineChart({
  data,
  format,
  ariaLabel,
  labelEvery = 1,
  ceiling,
}: {
  data: Datum[];
  format: (n: number) => string;
  ariaLabel: string;
  labelEvery?: number;
  /** Fix the top of the axis (e.g. 100 for percentages). */
  ceiling?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = ceiling ?? niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const x = (i: number) =>
    M.left + (data.length === 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => M.top + plotH * (1 - v / max);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      {hover !== null && data[hover] && (
        <Tooltip x={x(hover)} label={data[hover]!.label} value={format(data[hover]!.value)} />
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="mt-6 w-full"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const idx = Math.round(((px - M.left) / plotW) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, idx)));
        }}
      >
        <Grid max={max} format={format} />
        {data.length > 1 && (
          <path
            d={`${path} L${x(data.length - 1)},${M.top + plotH} L${x(0)},${M.top + plotH} Z`}
            className="fill-primary/10"
          />
        )}
        <path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && data[hover] && (
          <g aria-hidden>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={M.top}
              y2={M.top + plotH}
              className="stroke-muted-foreground"
              strokeDasharray="2 3"
            />
            {/* A 2px ring in the surface colour keeps the marker legible over the line. */}
            <circle
              cx={x(hover)}
              cy={y(data[hover]!.value)}
              r={5}
              className="fill-primary stroke-surface"
              strokeWidth={2}
            />
          </g>
        )}
        {data.map((d, i) => (
          <g key={d.label}>
            <rect
              x={x(i) - 8}
              y={M.top}
              width={16}
              height={plotH}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${format(d.value)}`}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="outline-none"
            />
            {i % labelEvery === 0 && (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {d.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Ranked horizontal bars as plain HTML: long names wrap and read naturally, values sit beside the bar. */
export function HorizontalBars({
  data,
  format,
  empty = "Nothing to show yet.",
}: {
  data: Datum[];
  format: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li
          key={d.label}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          title={`${d.label}: ${format(d.value)}`}
        >
          <span className="truncate">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-r-[4px] bg-surface-muted">
            <span
              className="block h-full rounded-r-[4px] bg-primary"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums text-muted-foreground">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}
