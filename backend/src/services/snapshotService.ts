import type { BlockStore } from "../stores/blockStore.js";
import type { DocumentStore } from "../stores/documentStore.js";
import type { Snapshot } from "../types/model.js";

export class SnapshotService {
  private readonly snapshotsByDoc = new Map<string, Snapshot[]>();

  constructor(
    private readonly blockStore: BlockStore,
    private readonly documentStore: DocumentStore,
    private readonly snapshotInterval: number = 20
  ) {}

  maybeCreateSnapshot(documentId: string, latestSequence: number): Snapshot | undefined {
    if (latestSequence === 0 || latestSequence % this.snapshotInterval !== 0) {
      return undefined;
    }

    return this.createSnapshot(documentId, latestSequence);
  }

  createSnapshot(documentId: string, upToSequence: number): Snapshot {
    const snapshot: Snapshot = {
      id: `${documentId}:snapshot:${upToSequence}`,
      documentId,
      createdAt: Date.now(),
      upToSequence,
      serializedBlockState: JSON.stringify(this.blockStore.getDocumentBlocks(documentId))
    };

    const snapshots = this.snapshotsByDoc.get(documentId) ?? [];
    snapshots.push(snapshot);
    this.snapshotsByDoc.set(documentId, snapshots);

    this.documentStore.setLatestSnapshotVersion(documentId, upToSequence);

    return snapshot;
  }

  getLatest(documentId: string): Snapshot | undefined {
    return this.snapshotsByDoc.get(documentId)?.at(-1);
  }

  getLatestBeforeOrAt(documentId: string, sequence: number): Snapshot | undefined {
    const snapshots = this.snapshotsByDoc.get(documentId) ?? [];
    for (let idx = snapshots.length - 1; idx >= 0; idx -= 1) {
      if (snapshots[idx].upToSequence <= sequence) {
        return snapshots[idx];
      }
    }

    return undefined;
  }

  list(documentId: string): Snapshot[] {
    return [...(this.snapshotsByDoc.get(documentId) ?? [])];
  }
}
