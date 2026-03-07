import type { WebSocket } from "ws";
import type { BlockStore } from "../stores/blockStore.js";
import type { DocumentStore } from "../stores/documentStore.js";
import type { OperationLogStore } from "../stores/operationLogStore.js";
import type { ClientToServerMessage, ServerToClientMessage } from "../types/protocol.js";
import { InvalidBaseBlockVersionError, StaleBlockVersionError } from "./operationService.js";
import type { OperationService } from "./operationService.js";
import type { PresenceService } from "./presenceService.js";
import type { SnapshotService } from "./snapshotService.js";

type Dependencies = {
  blockStore: BlockStore;
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

const MAX_RANGE_BLOCKS = 200;

export class DocumentSessionManager {
  private readonly socketToSession = new Map<WebSocket, SessionInfo>();

  private readonly socketsByDocument = new Map<string, Set<WebSocket>>();

  constructor(private readonly deps: Dependencies) {}

  handleClientMessage(socket: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "join_document") {
      this.prunePresenceAndBroadcastLeaves(message.documentId);
    }

    switch (message.type) {
      case "join_document": {
        this.prunePresenceAndBroadcastLeaves(message.documentId);
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
          this.leaveSession(socket, priorSession);
        }

        const session: SessionInfo = {
          documentId: message.documentId,
          clientId: message.clientId
        };

        this.socketToSession.set(socket, session);
        this.socketsByDocument.set(
          session.documentId,
          this.socketsByDocument.get(session.documentId) ?? new Set()
        );
        this.socketsByDocument.get(session.documentId)?.add(socket);

        this.deps.presenceService.join(
          session.documentId,
          session.clientId,
          message.displayName ?? "Anonymous"
        );

        this.send(socket, {
          type: "document_joined",
          documentId: session.documentId,
          document,
          initialRange: {
            startOrderKeyInclusive: 0,
            endOrderKeyExclusive: 50
          },
          presenceState: this.deps.presenceService.list(session.documentId),
          sequencing: this.getSequencing(session.documentId)
        });

        this.send(socket, {
          type: "presence_state",
          documentId: session.documentId,
          sessions: this.deps.presenceService.list(session.documentId)
        });

        this.broadcastToDocument(
          session.documentId,
          {
            type: "presence_diff",
            documentId: session.documentId,
            clientId: session.clientId,
            change: "joined",
            session: this.deps.presenceService
              .list(session.documentId)
              .find((item) => item.clientId === session.clientId)
          },
          socket
        );

        return;
      }

      case "load_range": {
        const session = this.requireSession(socket, message.documentId);
        if (!session) {
          return;
        }

        if (message.endOrderKeyExclusive < message.startOrderKeyInclusive) {
          this.send(socket, {
            type: "error",
            message: "Invalid range: endOrderKeyExclusive must be >= startOrderKeyInclusive"
          });
          return;
        }

        if (message.endOrderKeyExclusive - message.startOrderKeyInclusive > MAX_RANGE_BLOCKS) {
          this.send(socket, {
            type: "error",
            message: `Requested range too large; max span is ${MAX_RANGE_BLOCKS}`
          });
          return;
        }

        this.send(socket, {
          type: "range_data",
          documentId: session.documentId,
          startOrderKeyInclusive: message.startOrderKeyInclusive,
          endOrderKeyExclusive: message.endOrderKeyExclusive,
          blocks: this.deps.blockStore.getBlocksInRange(
            session.documentId,
            message.startOrderKeyInclusive,
            message.endOrderKeyExclusive
          )
        });
        return;
      }

      case "edit_block": {
        const session = this.requireSession(socket, message.documentId);
        if (!session) {
          return;
        }

        const currentBlock = this.deps.blockStore.getBlock(session.documentId, message.operation.blockId);
        if (!currentBlock) {
          this.send(socket, {
            type: "edit_rejected",
            documentId: session.documentId,
            operationId: message.operation.id,
            reason: `Block ${message.operation.blockId} not found in document ${session.documentId}`
          });
          return;
        }

        try {
          const applied = this.deps.operationService.submitOperation({
            id: message.operation.id,
            documentId: session.documentId,
            blockId: message.operation.blockId,
            clientId: session.clientId,
            baseBlockVersion: message.operation.baseBlockVersion,
            payload: message.operation.payload
          });

          const updatedBlock = this.deps.blockStore.getBlock(session.documentId, message.operation.blockId);
          if (!updatedBlock) {
            this.send(socket, {
              type: "error",
              message: `Block ${message.operation.blockId} disappeared after apply`
            });
            return;
          }

          const snapshot = this.deps.snapshotService.maybeCreateSnapshot(session.documentId, applied.sequence);
          this.deps.presenceService.heartbeat(session.documentId, session.clientId);

          this.send(socket, {
            type: "edit_accepted",
            documentId: session.documentId,
            operationId: message.operation.id,
            sequence: applied.sequence,
            appliedBlockVersion: applied.appliedBlockVersion
          });

          this.broadcastToDocument(
            session.documentId,
            {
              type: "block_updated",
              documentId: session.documentId,
              sequence: applied.sequence,
              block: updatedBlock,
              operation: message.operation,
              clientId: session.clientId
            },
            socket
          );

          if (snapshot) {
            this.broadcastToDocument(
              session.documentId,
              {
                type: "snapshot_created",
                documentId: session.documentId,
                snapshot
              },
              socket
            );
          }
        } catch (error) {
          if (
            error instanceof StaleBlockVersionError ||
            error instanceof InvalidBaseBlockVersionError
          ) {
            this.send(socket, {
              type: "edit_rejected",
              documentId: session.documentId,
              operationId: message.operation.id,
              reason: error.message,
              authoritativeBlockVersion: error.authoritativeBlock.version,
              authoritativeBlockText: error.authoritativeBlock.text
            });
          } else {
            this.send(socket, {
              type: "edit_rejected",
              documentId: session.documentId,
              operationId: message.operation.id,
              reason: error instanceof Error ? error.message : "Failed to apply operation",
              authoritativeBlockVersion: currentBlock.version,
              authoritativeBlockText: currentBlock.text
            });
          }

          this.send(socket, {
            type: "resync_required",
            documentId: session.documentId,
            reason: "Edit rejected; request resync and reload current authoritative state",
            sequencing: this.getSequencing(session.documentId)
          });
        }

        return;
      }

      case "presence_update": {
        const session = this.requireSession(socket, message.documentId, message.clientId);
        if (!session) {
          return;
        }

        this.deps.presenceService.update(session.documentId, session.clientId, message.presence);
        const latestSession = this.deps.presenceService
          .list(session.documentId)
          .find((item) => item.clientId === session.clientId);

        this.broadcastToDocument(
          session.documentId,
          {
            type: "presence_diff",
            documentId: session.documentId,
            clientId: session.clientId,
            change: "updated",
            session: latestSession
          },
          socket
        );
        return;
      }

      case "heartbeat": {
        const session = this.requireSession(socket, message.documentId, message.clientId);
        if (!session) {
          return;
        }

        this.deps.presenceService.heartbeat(session.documentId, session.clientId);
        return;
      }

      case "request_resync": {
        const session = this.requireSession(socket, message.documentId);
        if (!session) {
          return;
        }

        this.send(socket, {
          type: "resync_required",
          documentId: session.documentId,
          reason: `Client requested resync from sequence ${message.sinceSequence}`,
          sequencing: this.getSequencing(session.documentId)
        });
        return;
      }

      default: {
        this.send(socket, {
          type: "error",
          message: "Unknown client message type"
        });
      }
    }
  }

  handleClientDisconnect(socket: WebSocket): void {
    const session = this.socketToSession.get(socket);
    if (!session) {
      return;
    }

    this.leaveSession(socket, session);
  }

  private requireSession(socket: WebSocket, documentId: string, clientId?: string): SessionInfo | undefined {
    const session = this.socketToSession.get(socket);
    if (!session) {
      this.send(socket, {
        type: "error",
        message: "Join a document before sending messages"
      });
      return undefined;
    }

    if (session.documentId !== documentId || (clientId !== undefined && session.clientId !== clientId)) {
      this.send(socket, {
        type: "error",
        message: "Message target does not match joined session"
      });
      return undefined;
    }

    return session;
  }

  private leaveSession(socket: WebSocket, session: SessionInfo): void {
    this.deps.presenceService.leave(session.documentId, session.clientId);

    const documentSockets = this.socketsByDocument.get(session.documentId);
    documentSockets?.delete(socket);
    if (documentSockets?.size === 0) {
      this.socketsByDocument.delete(session.documentId);
    }

    this.socketToSession.delete(socket);

    this.broadcastToDocument(session.documentId, {
      type: "presence_diff",
      documentId: session.documentId,
      clientId: session.clientId,
      change: "left"
    });
  }

  private prunePresenceAndBroadcastLeaves(documentId: string): void {
    const expired = this.deps.presenceService.pruneExpired(documentId);
    for (const session of expired) {
      this.broadcastToDocument(documentId, {
        type: "presence_diff",
        documentId,
        clientId: session.clientId,
        change: "left"
      });
    }
  }

  private getSequencing(documentId: string): { latestSequence: number; latestSnapshotVersion: number } {
    return {
      latestSequence: this.deps.operationLogStore.getLatestSequence(documentId),
      latestSnapshotVersion: this.deps.documentStore.getDocument(documentId)?.latestSnapshotVersion ?? 0
    };
  }

  private broadcastToDocument(
    documentId: string,
    message: ServerToClientMessage,
    exceptSocket?: WebSocket
  ): void {
    const sockets = this.socketsByDocument.get(documentId);
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      if (socket === exceptSocket) {
        continue;
      }

      this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerToClientMessage): void {
    socket.send(JSON.stringify(message));
  }
}
