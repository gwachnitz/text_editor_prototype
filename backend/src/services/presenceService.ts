import type { PresenceState } from "../types/protocol.js";

export class PresenceService {
  private readonly presenceByDoc = new Map<string, Map<string, PresenceState>>();

  join(documentId: string, clientId: string): void {
    if (!this.presenceByDoc.has(documentId)) {
      this.presenceByDoc.set(documentId, new Map());
    }

    this.presenceByDoc.get(documentId)?.set(clientId, { status: "online" });
  }

  leave(documentId: string, clientId: string): void {
    const docPresence = this.presenceByDoc.get(documentId);
    if (!docPresence) {
      return;
    }

    docPresence.delete(clientId);

    if (docPresence.size === 0) {
      this.presenceByDoc.delete(documentId);
    }
  }

  update(documentId: string, clientId: string, presence: PresenceState): void {
    if (!this.presenceByDoc.has(documentId)) {
      this.presenceByDoc.set(documentId, new Map());
    }

    this.presenceByDoc.get(documentId)?.set(clientId, presence);
  }

  list(documentId: string): Array<{ clientId: string; state: PresenceState }> {
    const entries = this.presenceByDoc.get(documentId)?.entries() ?? [];
    return [...entries].map(([clientId, state]) => ({ clientId, state }));
  }
}
