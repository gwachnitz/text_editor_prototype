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
    const docPresence = this.presenceByDoc.get(documentId) ?? new Map<string, PresenceSession>();
    const now = Date.now();
    const session = docPresence.get(clientId) ?? {
      clientId,
      displayName: "Anonymous",
      documentId,
      lastHeartbeatAt: now
    };

    session.lastHeartbeatAt = now;
    docPresence.set(clientId, session);
    this.presenceByDoc.set(documentId, docPresence);
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
    if (presence.cursorBlockId !== undefined || presence.cursorOffset !== undefined) {
      existing.cursor = {
        blockId: presence.cursorBlockId ?? existing.cursor?.blockId,
        offset: presence.cursorOffset ?? existing.cursor?.offset
      };
    }
    existing.lastHeartbeatAt = now;

    docPresence.set(clientId, existing);
    this.presenceByDoc.set(documentId, docPresence);
  }

  list(documentId: string): PresenceSession[] {
    this.pruneExpired(documentId);
    return [...(this.presenceByDoc.get(documentId)?.values() ?? [])];
  }

  pruneExpired(documentId: string): PresenceSession[] {
    const sessions = this.presenceByDoc.get(documentId);
    if (!sessions) {
      return [];
    }

    const cutoff = Date.now() - this.ttlMs;
    const expired: PresenceSession[] = [];
    for (const [clientId, session] of sessions.entries()) {
      if (session.lastHeartbeatAt < cutoff) {
        expired.push(session);
        sessions.delete(clientId);
      }
    }

    if (sessions.size === 0) {
      this.presenceByDoc.delete(documentId);
    }

    return expired;
  }
}
