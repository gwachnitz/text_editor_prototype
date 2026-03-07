import type { ClientToServerMessage, ServerToClientMessage } from "../types/protocol";

export class RealtimeClient {
  private socket?: WebSocket;

  constructor(private readonly url: string) {}

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

  joinDocument(params: { documentId: string; clientId: string }): void {
    const joinMessage: ClientToServerMessage = {
      type: "join_document",
      documentId: params.documentId,
      clientId: params.clientId
    };

    // Retry sending for a limited number of attempts while the socket is
    // still connecting, and stop if it is closed/closing.
    const maxAttempts = 200; // 200 * 50ms = 10 seconds max retry window
    let attempts = 0;

    const trySend = () => {
      const socket = this.socket;

      if (!socket) {
        // Socket no longer exists; stop retrying.
        return;
      }

      if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        // Connection is shutting down or closed; stop retrying.
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        this.send(joinMessage);
        return;
      }

      if (attempts >= maxAttempts) {
        // Give up after the maximum number of attempts to avoid unbounded polling.
        return;
      }

      attempts += 1;
      setTimeout(trySend, 50);
    };

    trySend();
  }
}
