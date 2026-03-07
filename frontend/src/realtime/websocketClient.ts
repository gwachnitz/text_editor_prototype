import type {
  ClientToServerMessage,
  PresenceState,
  ServerToClientMessage,
  SubmittedOperation
} from "../types/protocol";

export class RealtimeClient {
  private socket?: WebSocket;

  constructor(
    private readonly url: string,
    private readonly onMessage?: (message: ServerToClientMessage) => void
  ) {}

  connect(): void {
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener("message", (event) => {
      let message: ServerToClientMessage;
      try {
        message = JSON.parse(event.data) as ServerToClientMessage;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[ws] failed to parse message", error, event.data);
        return;
      }

      if (this.onMessage) {
        try {
          this.onMessage(message);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[ws] error in onMessage handler", error, message);
        }
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[ws] message", message);
    });
  }

  disconnect(): void {
    this.socket?.close();
  }

  send(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  joinDocument(params: { documentId: string; clientId: string; displayName?: string }): void {
    const joinMessage: ClientToServerMessage = {
      type: "join_document",
      documentId: params.documentId,
      clientId: params.clientId,
      displayName: params.displayName
    };

    const maxAttempts = 200;
    let attempts = 0;

    const trySend = () => {
      const socket = this.socket;

      if (!socket) {
        return;
      }

      if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        this.send(joinMessage);
        return;
      }

      if (attempts >= maxAttempts) {
        return;
      }

      attempts += 1;
      setTimeout(trySend, 50);
    };

    trySend();
  }

  loadRange(params: {
    documentId: string;
    startOrderKeyInclusive: number;
    endOrderKeyExclusive: number;
  }): void {
    this.send({ type: "load_range", ...params });
  }

  editBlock(params: { documentId: string; operation: SubmittedOperation }): void {
    this.send({ type: "edit_block", ...params });
  }

  updatePresence(params: { documentId: string; clientId: string; presence: PresenceState }): void {
    this.send({ type: "presence_update", ...params });
  }

  heartbeat(params: { documentId: string; clientId: string }): void {
    this.send({ type: "heartbeat", ...params });
  }

  requestResync(params: { documentId: string; sinceSequence: number }): void {
    this.send({ type: "request_resync", ...params });
  }
}
