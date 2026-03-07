import type { PresenceSession } from "../types/model.js";
import type { PresenceState } from "../types/protocol.js";

export class PresenceService {
  private readonly presenceByDoc = new Map<string, Map<string, PresenceSession>>();

  constructor(private readonly ttlMs: number = 30_000) {}

  join(documentId: string, clientId: string, displayName: string = "Anonymous"): void {
    const now = Date.now();
    const current = this.presenceByDoc.get(documentId) ?? new Map<string, PresenceSession>();

    current.set(clientId, {
      clientId,
      displayName,
      documentId,
      lastHeartbeatAt: now
    });

    this.presenceByDoc.set(documentId, current);
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

  heartbeat(documentId: string, clientId: string): void {
    const session = this.presenceByDoc.get(documentId)?.get(clientId);
    if (!session) {
      return;
    }

    session.lastHeartbeatAt = Date.now();
  }

  update(documentId: string, clientId: string, presence: PresenceState): void {
    const docPresence = this.presenceByDoc.get(documentId) ?? new Map<string, PresenceSession>();
    const now = Date.now();

    const existing = docPresence.get(clientId) ?? {
      clientId,
      displayName: presence.displayName ?? "Anonymous",
      documentId,
      lastHeartbeatAt: now
    };

    existing.displayName = presence.displayName ?? existing.displayName;
    existing.activeBlockId = presence.activeBlockId ?? presence.cursorBlockId ?? existing.activeBlockId;
    existing.cursor = {
      blockId: presence.cursorBlockId,
      offset: presence.cursorOffset
    };
    existing.lastHeartbeatAt = now;

    docPresence.set(clientId, existing);
    this.presenceByDoc.set(documentId, docPresence);
  }

  list(documentId: string): PresenceSession[] {
    this.pruneExpired(documentId);
    return [...(this.presenceByDoc.get(documentId)?.values() ?? [])];
  }

  pruneExpired(documentId: string): void {
    const sessions = this.presenceByDoc.get(documentId);
    if (!sessions) {
      return;
    }

    const cutoff = Date.now() - this.ttlMs;
    for (const [clientId, session] of sessions.entries()) {
      if (session.lastHeartbeatAt < cutoff) {
        sessions.delete(clientId);
      }
    }

    if (sessions.size === 0) {
      this.presenceByDoc.delete(documentId);
    }
  }
}
