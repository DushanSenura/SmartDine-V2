import type { Server as HttpServer } from "node:http";

import { SocketEvents } from "@smartdine/shared";
import { Server } from "socket.io";
import { z } from "zod";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { verifyAccessToken } from "../modules/auth/token.service";
import { assertBranchAccess } from "../shared/auth/branchAccess";
import type { AuthContext } from "../types/express";

/**
 * Socket.IO server. Connections must present a valid access token in `handshake.auth.token`
 * and are placed in rooms used by domain modules (`*.socket.ts`) to target events:
 * `user:<id>`, `role:<ROLE>` and `branch:<id>`.
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      socket.data.auth = verifyAccessToken(token);
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, role, branchId } = socket.data.auth as ReturnType<typeof verifyAccessToken>;
    void socket.join([
      `user:${userId}`,
      `role:${role}`,
      ...(branchId ? [`branch:${branchId}`] : []),
    ]);
    logger.debug({ socketId: socket.id, userId, role }, "Socket connected");
    // Owners have no home branch; anyone may (re)subscribe to a branch they are allowed to access.
    // Rooms are lost on reconnect, so clients re-send this after every connect.
    socket.on(SocketEvents.BRANCH_JOIN, (branchId: unknown) => {
      if (typeof branchId !== "string" || !z.uuid().safeParse(branchId).success) return;
      try {
        assertBranchAccess(socket.data.auth as AuthContext, branchId);
      } catch {
        return; // silently ignore: no information about other branches is revealed
      }
      void socket.join(`branch:${branchId}`);
    });
    socket.on(SocketEvents.BRANCH_LEAVE, (branchId: unknown) => {
      // Staff stay in their own branch room; only owners' extra subscriptions are released.
      if (typeof branchId === "string" && branchId !== (socket.data.auth as AuthContext).branchId) {
        void socket.leave(`branch:${branchId}`);
      }
    });
    socket.on("disconnect", (reason) => {
      logger.debug({ socketId: socket.id, reason }, "Socket disconnected");
    });
  });

  return io;
}
