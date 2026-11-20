import type { Server } from "socket.io";

let io: Server | null = null;

export function registerSocketServer(server: Server) {
  io = server;
}

/** Broadcasts to every connected staff member of a branch. No-op when sockets are not running (tests). */
export function emitToBranch(branchId: string, event: string, payload: unknown) {
  io?.to(`branch:${branchId}`).emit(event, payload);
}

/** Sends to one user's connected devices. No-op when sockets are not running (tests). */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
