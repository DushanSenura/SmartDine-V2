import { Permissions, type TableDto } from "@smartdine/shared";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Pencil, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/EmptyState";
import { SelectField } from "@/components/forms/fields";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { BranchRequired } from "@/features/branches/components/BranchRequired";
import { useStaff } from "@/features/staff/api/staffQueries";
import { cn } from "@/lib/utils";

import {
  floorKeys,
  useAreas,
  useAssignWaiter,
  useSaveLayout,
  useSaveTable,
  useTables,
} from "../api/floorQueries";
import { AreaDialog } from "../components/AreaDialog";
import { FloorCanvas, type LayoutChange } from "../components/FloorCanvas";
import { TableInspector } from "../components/TableInspector";
import { useLiveTables } from "../hooks/useLiveTables";
import { findFreeSpot, nextTableNumber } from "../utils/geometry";
import { TABLE_STATUS_STYLES } from "../utils/tableStatus";

function Legend() {
  return (
    <ul
      aria-label="Status legend"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {Object.entries(TABLE_STATUS_STYLES).map(([status, style]) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm border-2", style.className)} aria-hidden />
          {style.label}
        </li>
      ))}
    </ul>
  );
}

function FloorPlan({ branchId }: { branchId: string }) {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(Permissions.TABLES_MANAGE);
  const canChangeStatus = can(Permissions.TABLES_STATUS);

  const tables = useTables(branchId);
  const areas = useAreas(branchId);
  const waiters = useStaff(branchId, "WAITER", canManage);
  useLiveTables(branchId);

  const saveLayout = useSaveLayout();
  const saveTable = useSaveTable();
  const assign = useAssignWaiter();

  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [areaDialog, setAreaDialog] = useState<"new" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeArea = areas.data?.find((a) => a.id === activeAreaId) ?? areas.data?.[0];
  const areaTables = useMemo(
    () => (tables.data ?? []).filter((t) => t.diningAreaId === activeArea?.id),
    [tables.data, activeArea?.id],
  );
  const selected = tables.data?.find((t) => t.id === selectedId) ?? null;

  const onCommit = async (change: LayoutChange) => {
    setError(null);
    const key = floorKeys.tables(branchId);
    // Optimistic: the table stays where it was dropped while the request is in flight.
    queryClient.setQueryData<TableDto[]>(key, (current = []) =>
      current.map((t) =>
        t.id === change.id
          ? {
              ...t,
              positionX: change.positionX,
              positionY: change.positionY,
              width: change.width,
              height: change.height,
            }
          : t,
      ),
    );
    try {
      await saveLayout.mutateAsync({ tables: [change] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the layout.");
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const addTable = async () => {
    if (!activeArea) return;
    setError(null);
    const size = { w: 80, h: 80 };
    const spot = findFreeSpot(
      areaTables.map((t) => ({ x: t.positionX, y: t.positionY, w: t.width, h: t.height })),
      size,
      { width: activeArea.width, height: activeArea.height },
    );
    try {
      const created = await saveTable.mutateAsync({
        input: {
          branchId,
          diningAreaId: activeArea.id,
          tableNumber: nextTableNumber((tables.data ?? []).map((t) => t.tableNumber)),
          capacity: 4,
          positionX: spot.x,
          positionY: spot.y,
          width: size.w,
          height: size.h,
        },
      });
      setSelectedId((created as TableDto).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the table.");
    }
  };

  const assignAreaWaiter = async (waiterId: string) => {
    if (!areaTables.length) return;
    setError(null);
    try {
      await assign.mutateAsync({
        tableIds: areaTables.map((t) => t.id),
        waiterId: waiterId || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't assign the waiter.");
    }
  };

  if (tables.isPending || areas.isPending) return <ListSkeleton rows={5} />;
  if (tables.isError || areas.isError) {
    return (
      <ErrorState
        message="Couldn't load the floor."
        onRetry={() => {
          void tables.refetch();
          void areas.refetch();
        }}
      />
    );
  }

  if (!areas.data.length) {
    return (
      <>
        <PageHeader title="Floor plan" />
        <EmptyState
          icon={LayoutGrid}
          title="No floors configured"
          text={
            canManage
              ? "Create a floor or dining area, then add tables to it."
              : "A manager hasn't set up the floor plan yet."
          }
          action={
            canManage ? (
              <Button onClick={() => setAreaDialog("new")}>Create a floor</Button>
            ) : undefined
          }
        />
        {areaDialog === "new" && (
          <AreaDialog
            branchId={branchId}
            onClose={() => setAreaDialog(null)}
            onSaved={(a) => setActiveAreaId(a.id)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Floor plan"
        description="Live table status. Changes made on other devices appear instantly."
        actions={
          <>
            {user?.role === "WAITER" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={mineOnly}
                  onChange={(e) => setMineOnly(e.target.checked)}
                />
                My tables
              </label>
            )}
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setAreaDialog("new")}>
                  <Plus className="size-4" aria-hidden /> Floor
                </Button>
                <Button
                  variant={editMode ? "primary" : "outline"}
                  aria-pressed={editMode}
                  onClick={() => setEditMode((v) => !v)}
                >
                  <Pencil className="size-4" aria-hidden />{" "}
                  {editMode ? "Done editing" : "Edit layout"}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Floors" className="flex flex-wrap gap-1">
          {areas.data.map((area) => (
            <button
              key={area.id}
              role="tab"
              aria-selected={area.id === activeArea?.id}
              onClick={() => {
                setActiveAreaId(area.id);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                area.id === activeArea?.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface hover:bg-surface-muted",
                !area.isActive && "border-dashed opacity-70",
              )}
            >
              {area.name}
              {!area.isActive && " (unavailable)"}
            </button>
          ))}
        </div>
        {editMode && (
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" onClick={() => setAreaDialog("edit")}>
              <Settings2 className="size-4" aria-hidden /> Area settings
            </Button>
            <Button onClick={() => void addTable()} disabled={saveTable.isPending}>
              <Plus className="size-4" aria-hidden /> Add table
            </Button>
            <div className="w-52">
              <SelectField
                label="Assign waiter to all tables here"
                placeholder="Choose waiter…"
                value=""
                options={[
                  { value: "", label: "Unassign all" },
                  ...(waiters.data ?? []).map((w) => ({
                    value: w.id,
                    label: `${w.firstName} ${w.lastName}`,
                  })),
                ]}
                onChange={(e) => void assignAreaWaiter(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-3">
          {activeArea && (
            <FloorCanvas
              area={activeArea}
              tables={areaTables}
              selectedId={selectedId}
              editable={editMode && canManage}
              highlightWaiterId={mineOnly ? user?.id : undefined}
              onSelect={setSelectedId}
              onCommit={(change) => void onCommit(change)}
            />
          )}
          {!areaTables.length && (
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "No tables on this floor yet — choose “Edit layout”, then “Add table”."
                : "No tables on this floor."}
            </p>
          )}
          <Legend />
        </div>
        {selected && (
          <TableInspector
            key={selected.id}
            table={selected}
            areas={areas.data}
            waiters={waiters.data ?? []}
            canManage={canManage && editMode}
            canChangeStatus={canChangeStatus}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {areaDialog === "new" && (
        <AreaDialog
          branchId={branchId}
          onClose={() => setAreaDialog(null)}
          onSaved={(a) => setActiveAreaId(a.id)}
        />
      )}
      {areaDialog === "edit" && activeArea && (
        <AreaDialog branchId={branchId} area={activeArea} onClose={() => setAreaDialog(null)} />
      )}
    </div>
  );
}

export function FloorPlanPage() {
  return <BranchRequired>{(branchId) => <FloorPlan branchId={branchId} />}</BranchRequired>;
}
