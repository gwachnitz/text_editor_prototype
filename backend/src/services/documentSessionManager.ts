import type { WebSocket } from "ws";
import type { DocumentStore } from "../stores/documentStore.js";
import type { OperationLogStore } from "../stores/operationLogStore.js";
import type { ClientToServerMessage, ServerToClientMessage } from "../types/protocol.js";
import type { OperationService } from "./operationService.js";
import type { PresenceService } from "./presenceService.js";
import type { SnapshotService } from "./snapshotService.js";

type Dependencies = {
  documentStore: DocumentStore;
  operationLogStore: OperationLogStore;
  operationService: OperationService;
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
        const document = this.deps.documentStore.getDocument(message.documentId);
        if (!document) {
          this.send(socket, {
            type: "error",
            message: `Document ${message.documentId} not found`
          });
          return;
        }

        const priorSession = this.socketToSession.get(socket);
        if (priorSession) {
          this.deps.presenceService.leave(priorSession.documentId, priorSession.clientId);
        }

        const session: SessionInfo = {
          documentId: message.documentId,
          clientId: message.clientId
        };

        this.socketToSession.set(socket, session);
        this.deps.presenceService.join(
          session.documentId,
          session.clientId,
          message.displayName ?? "Anonymous"
        );

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

        const applied = this.deps.operationService.submitOperation({
          id: message.operation.id,
          documentId: session.documentId,
          blockId: message.operation.blockId,
          clientId: message.operation.clientId,
          baseBlockVersion: message.operation.baseBlockVersion,
          payload: message.operation.payload
        });

        this.deps.snapshotService.maybeCreateSnapshot(session.documentId, applied.sequence);
        this.deps.presenceService.heartbeat(session.documentId, session.clientId);

        this.send(socket, {
          type: "operation_acked",
          documentId: session.documentId,
          sequence: applied.sequence,
          appliedBlockVersion: applied.appliedBlockVersion
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
