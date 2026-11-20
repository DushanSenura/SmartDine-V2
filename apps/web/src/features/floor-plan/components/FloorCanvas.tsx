import type { DiningAreaDto, TableDto } from "@smartdine/shared";
import { useState } from "react";

import type { Rect } from "../utils/geometry";
import { TableNode } from "./TableNode";

const rectOf = (t: TableDto): Rect => ({ x: t.positionX, y: t.positionY, w: t.width, h: t.height });

export interface LayoutChange {
  id: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export function FloorCanvas({
  area,
  tables,
  selectedId,
  editable,
  highlightWaiterId,
  onSelect,
  onCommit,
}: {
  area: DiningAreaDto;
  tables: TableDto[];
  selectedId: string | null;
  editable: boolean;
  /** When set, tables not assigned to this waiter are dimmed. */
  highlightWaiterId?: string;
  onSelect: (id: string | null) => void;
  onCommit: (change: LayoutChange) => void;
}) {
  // Live geometry while a gesture is in progress; the server value is used otherwise.
  const [preview, setPreview] = useState<{ id: string; rect: Rect } | null>(null);
  const bounds = { width: area.width, height: area.height };

  return (
    <div className="overflow-auto rounded-lg border border-border bg-surface-muted/50">
      <div
        role="group"
        aria-label={`${area.name} floor plan`}
        onPointerDown={() => onSelect(null)}
        className="relative"
        style={{
          width: area.width,
          height: area.height,
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1.5px)",
          backgroundSize: "20px 20px",
        }}
      >
        {!area.isActive && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 text-sm font-medium">
            This area is marked unavailable
          </div>
        )}
        {tables.map((table) => (
          <TableNode
            key={table.id}
            table={table}
            rect={preview?.id === table.id ? preview.rect : rectOf(table)}
            bounds={bounds}
            selected={selectedId === table.id}
            editable={editable}
            dimmed={!!highlightWaiterId && table.assignedWaiterId !== highlightWaiterId}
            onSelect={() => onSelect(table.id)}
            onPreview={(rect) => setPreview({ id: table.id, rect })}
            onCommit={(rect) => {
              setPreview(null);
              onCommit({
                id: table.id,
                positionX: rect.x,
                positionY: rect.y,
                width: rect.w,
                height: rect.h,
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
