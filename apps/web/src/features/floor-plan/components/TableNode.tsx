import type { TableDto } from "@smartdine/shared";
import { motion } from "motion/react";
import { Users } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

import { moveRect, resizeRect, GRID, type Bounds, type Rect } from "../utils/geometry";
import { TABLE_STATUS_STYLES } from "../utils/tableStatus";

interface TableNodeProps {
  table: TableDto;
  rect: Rect;
  bounds: Bounds;
  selected: boolean;
  editable: boolean;
  dimmed: boolean;
  onSelect: () => void;
  /** Called continuously while dragging / resizing (local preview only). */
  onPreview: (rect: Rect) => void;
  /** Called once when the gesture ends (persist). */
  onCommit: (rect: Rect) => void;
}

interface Gesture {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  start: Rect;
  latest: Rect;
  moved: boolean;
}

export function TableNode({
  table,
  rect,
  bounds,
  selected,
  editable,
  dimmed,
  onSelect,
  onPreview,
  onCommit,
}: TableNodeProps) {
  const gesture = useRef<Gesture | null>(null);
  const style = TABLE_STATUS_STYLES[table.status];
  const StatusIcon = style.icon;
  const keepSquare = table.shape !== "RECTANGLE";
  const compact = rect.w < 80 || rect.h < 70;

  const begin = (event: PointerEvent<HTMLElement>, mode: Gesture["mode"]) => {
    // Always stop here, or the canvas background's "deselect" handler would undo the selection.
    event.stopPropagation();
    onSelect();
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      start: rect,
      latest: rect,
      moved: false,
    };
  };

  const update = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 3) return; // ignore click jitter
    g.moved = true;
    g.latest =
      g.mode === "move"
        ? moveRect(g.start, dx, dy, bounds)
        : resizeRect(g.start, dx, dy, bounds, keepSquare);
    onPreview(g.latest);
  };

  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.moved) onCommit(g.latest);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
      return;
    }
    const step = event.shiftKey ? GRID * 5 : GRID;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!editable || !move) return;
    event.preventDefault();
    onCommit(moveRect(rect, move[0], move[1], bounds));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Table ${table.tableNumber}, ${table.capacity} seats, ${style.label}${
        table.assignedWaiterName ? `, waiter ${table.assignedWaiterName}` : ""
      }`}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={update}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, touchAction: "none" }}
      className={cn(
        "absolute flex flex-col items-center justify-center gap-0.5 border-2 text-center shadow-sm transition-[background-color,border-color,opacity,box-shadow] duration-300 select-none",
        table.shape === "ROUND" ? "rounded-full" : "rounded-lg",
        style.className,
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        dimmed && "opacity-30",
      )}
    >
      <span className="text-base leading-none font-semibold">{table.tableNumber}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="size-3" aria-hidden />
        {table.capacity}
      </span>
      {!compact && (
        // Re-keyed on status so a change animates in instead of swapping instantly.
        <motion.span
          key={table.status}
          initial={{ opacity: 0, y: -4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22 }}
          className="flex max-w-full items-center gap-1 px-1 text-[10px] leading-tight font-medium"
        >
          <StatusIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{style.label}</span>
        </motion.span>
      )}
      {editable && selected && (
        <span
          aria-hidden
          onPointerDown={(e) => begin(e, "resize")}
          onPointerMove={update}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border-2 border-primary bg-background"
        />
      )}
    </div>
  );
}
