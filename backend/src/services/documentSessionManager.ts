import type { WebSocket } from "ws";
import type { BlockStore } from "../stores/blockStore.js";
import type { OperationLogStore } from "../stores/operationLogStore.js";
import type { ClientToServerMessage, ServerToClientMessage } from "../types/protocol.js";
import type { PresenceService } from "./presenceService.js";
import type { SnapshotService } from "./snapshotService.js";

type Dependencies = {
  blockStore: BlockStore;
  operationLogStore: OperationLogStore;
  snapshotService: SnapshotService;
  presenceService: PresenceService;
};

type SessionInfo = {
  documentId: string;
  clientId: string;
};

export class DocumentSessionManager {
  private readonly socketToSession = new Map<WebSocket, SessionInfo>();

  constructor(private readonly deps: Dependencies) {}

  handleClientMessage(socket: WebSocket, message: ClientToServerMessage): void {
    switch (message.type) {
      case "join_document": {
        const priorSession = this.socketToSession.get(socket);
        if (priorSession) {
          this.deps.presenceService.leave(priorSession.documentId, priorSession.clientId);
        }

        const session: SessionInfo = {
          documentId: message.documentId,
          clientId: message.clientId
        };

        this.socketToSession.set(socket, session);
        this.deps.presenceService.join(session.documentId, session.clientId);

        this.send(socket, {
          type: "document_joined",
          documentId: session.documentId,
          serverRevision: this.deps.operationLogStore.getLatestSequence(session.documentId)
        });
        return;
      }

      case "submit_operation": {
        const session = this.socketToSession.get(socket);
        if (!session) {
          this.send(socket, {
            type: "error",
            message: "Join a document before submitting operations"
          });
          return;
        }

        if (message.documentId !== session.documentId) {
          this.send(socket, {
            type: "error",
            message: "submit_operation documentId does not match joined session"
          });
          return;
        }

        const sequence = this.deps.operationLogStore.append(session.documentId, message.operation);
        this.deps.snapshotService.maybeCreateSnapshot(session.documentId, sequence);

        this.send(socket, {
          type: "operation_acked",
          documentId: session.documentId,
          sequence
        });
        return;
      }

      case "presence_update": {
        const session = this.socketToSession.get(socket);
        if (!session) {
          this.send(socket, {
            type: "error",
            message: "Join a document before sending presence updates"
          });
          return;
        }

        if (message.documentId !== session.documentId || message.clientId !== session.clientId) {
          this.send(socket, {
            type: "error",
            message: "presence_update target does not match joined session"
          });
          return;
        }

        this.deps.presenceService.update(session.documentId, session.clientId, message.presence);

        this.send(socket, {
          type: "presence_acked",
          documentId: session.documentId,
          clientId: session.clientId
        });
        return;
      }

      default: {
        this.send(socket, {
          type: "error",
          message: "Unknown client message type"
        } as ServerToClientMessage);
        return;
      }
    }
  }

  handleClientDisconnect(socket: WebSocket): void {
    const session = this.socketToSession.get(socket);
    if (session) {
      this.deps.presenceService.leave(session.documentId, session.clientId);
      this.socketToSession.delete(socket);
    }
  }

  private send(socket: WebSocket, message: ServerToClientMessage): void {
    socket.send(JSON.stringify(message));
  }
}
