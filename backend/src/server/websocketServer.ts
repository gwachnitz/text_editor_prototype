import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { DocumentSessionManager } from "../services/documentSessionManager.js";
import type { ClientToServerMessage } from "../types/protocol.js";

export function createWebSocketServer(
  httpServer: Server,
  sessionManager: DocumentSessionManager
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientToServerMessage;
        sessionManager.handleClientMessage(socket, parsed);
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message payload"
          })
        );
      }
    });

    socket.on("close", () => {
      sessionManager.handleClientDisconnect(socket);
    });
  });

  return wss;
}
