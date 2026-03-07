import type { BlockStore } from "../stores/blockStore.js";
import type { OperationLogStore } from "../stores/operationLogStore.js";

type SnapshotMeta = {
  latestSequence: number;
  createdAt: number;
};

export class SnapshotService {
  private readonly latestSnapshotByDoc = new Map<string, SnapshotMeta>();

  constructor(
    private readonly blockStore: BlockStore,
    private readonly operationLogStore: OperationLogStore
  ) {}

  maybeCreateSnapshot(documentId: string, latestSequence: number): void {
    if (latestSequence % 20 !== 0) {
      return;
    }

    // Placeholder: when implementing real behavior, materialize block state + trim/reindex op log.
    this.latestSnapshotByDoc.set(documentId, {
      latestSequence,
      createdAt: Date.now()
    });

    // Read stores to make planned dependencies explicit in this scaffold.
    this.blockStore.getDocumentBlocks(documentId);
    this.operationLogStore.getLatestSequence(documentId);
  }

  getLatest(documentId: string): SnapshotMeta | undefined {
    return this.latestSnapshotByDoc.get(documentId);
  }
}
