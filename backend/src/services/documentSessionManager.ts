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

export class DocumentSessionManager {
  private readonly socketToDocId = new Map<WebSocket, string>();

  constructor(private readonly deps: Dependencies) {}

  handleClientMessage(socket: WebSocket, message: ClientToServerMessage): void {
    switch (message.type) {
      case "join_document": {
        this.socketToDocId.set(socket, message.documentId);
        this.deps.presenceService.join(message.documentId, message.clientId);

        this.send(socket, {
          type: "document_joined",
          documentId: message.documentId,
          serverRevision: this.deps.operationLogStore.getLatestSequence(message.documentId)
        });
        return;
      }

      case "submit_operation": {
        const sequence = this.deps.operationLogStore.append(message.documentId, message.operation);
        this.deps.snapshotService.maybeCreateSnapshot(message.documentId, sequence);

        this.send(socket, {
          type: "operation_acked",
          documentId: message.documentId,
          sequence
        });
        return;
      }

      case "presence_update": {
        this.deps.presenceService.update(message.documentId, message.clientId, message.presence);

        this.send(socket, {
          type: "presence_acked",
          documentId: message.documentId,
          clientId: message.clientId
        });
      }
    }
  }

  handleClientDisconnect(socket: WebSocket): void {
    const docId = this.socketToDocId.get(socket);
    if (docId) {
      this.socketToDocId.delete(socket);
    }
  }

  private send(socket: WebSocket, message: ServerToClientMessage): void {
    socket.send(JSON.stringify(message));
  }
}
