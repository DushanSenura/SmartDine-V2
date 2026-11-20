import { SocketEvents, type TableDto } from "@smartdine/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

import { floorKeys } from "../api/floorQueries";

/**
 * Keeps the floor in sync with changes made on other devices: single-table events patch the
 * cache directly; structural changes (areas, bulk layout, assignments) trigger a refetch.
 */
export function useLiveTables(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);

  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const key = floorKeys.tables(branchId);

    const upsert = (table: TableDto) => {
      if (table.branchId !== branchId) return;
      queryClient.setQueryData<TableDto[]>(key, (current = []) =>
        current.some((t) => t.id === table.id)
          ? current.map((t) => (t.id === table.id ? table : t))
          : [...current, table],
      );
    };
    const remove = ({ id }: { id: string }) =>
      queryClient.setQueryData<TableDto[]>(key, (current = []) =>
        current.filter((t) => t.id !== id),
      );
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: floorKeys.areas(branchId) });
    };

    socket.on(SocketEvents.TABLE_CREATED, upsert);
    socket.on(SocketEvents.TABLE_UPDATED, upsert);
    socket.on(SocketEvents.TABLE_DELETED, remove);
    socket.on(SocketEvents.FLOOR_LAYOUT_CHANGED, refetch);
    // Anything missed while offline is recovered on reconnect.
    socket.io.on("reconnect", refetch);

    return () => {
      socket.off(SocketEvents.TABLE_CREATED, upsert);
      socket.off(SocketEvents.TABLE_UPDATED, upsert);
      socket.off(SocketEvents.TABLE_DELETED, remove);
      socket.off(SocketEvents.FLOOR_LAYOUT_CHANGED, refetch);
      socket.io.off("reconnect", refetch);
    };
  }, [branchId, queryClient]);
}
