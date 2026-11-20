import { io, type Socket } from "socket.io-client";

import { useAuthStore } from "@/stores/authStore";

let socket: Socket | null = null;

/**
 * Shared Socket.IO connection. The token is read through a function so every (re)connect
 * authenticates with the current access token, even after silent refreshes.
 */
export function getSocket(): Socket {
  socket ??= io({
    auth: (callback) => callback({ token: useAuthStore.getState().accessToken }),
    transports: ["websocket", "polling"],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
