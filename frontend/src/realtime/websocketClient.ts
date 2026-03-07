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

    const trySend = () => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send(joinMessage);
      } else {
        setTimeout(trySend, 50);
      }
    };

    trySend();
  }
}
