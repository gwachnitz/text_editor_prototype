import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { DocumentSessionManager } from "../services/documentSessionManager.js";
import { isClientToServerMessage } from "./messageValidation.js";

export function createWebSocketServer(
  httpServer: Server,
  sessionManager: DocumentSessionManager
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message payload"
          })
        );
        return;
      }

      if (!isClientToServerMessage(parsed)) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message payload"
          })
        );
        return;
      }

      try {
        sessionManager.handleClientMessage(socket, parsed);
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Failed to process message"
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

