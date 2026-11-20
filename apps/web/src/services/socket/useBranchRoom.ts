import { SocketEvents } from "@smartdine/shared";
import { useEffect } from "react";

import { getSocket } from "./socket";

/**
 * Subscribes the shared socket to a branch's live events for as long as the caller is mounted.
 * Owners have no home branch and must join explicitly; staff are already in their own room.
 * Rooms do not survive a reconnect, so the join is repeated on every `connect`.
 */
export function useBranchRoom(branchId: string | undefined) {
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const join = () => socket.emit(SocketEvents.BRANCH_JOIN, branchId);
    if (socket.connected) join();
    socket.on("connect", join);
    return () => {
      socket.off("connect", join);
      socket.emit(SocketEvents.BRANCH_LEAVE, branchId);
    };
  }, [branchId]);
}
