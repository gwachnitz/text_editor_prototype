import type { OperationLogStore } from "../stores/operationLogStore.js";
import type { Block, Operation, Snapshot } from "../types/model.js";
import type { SnapshotService } from "./snapshotService.js";

export type ReconstructionResult = {
  snapshot?: Snapshot;
  targetSequence: number;
  appliedOperations: Operation[];
  blocks: Block[];
};

export class RecoveryService {
  constructor(
    private readonly operationLogStore: OperationLogStore,
    private readonly snapshotService: SnapshotService
  ) {}

  reconstructDocumentState(documentId: string, targetSequence?: number): ReconstructionResult {
    const latestSequence = this.operationLogStore.getLatestSequence(documentId);
    let resolvedTarget = targetSequence ?? latestSequence;

    if (!Number.isFinite(resolvedTarget)) {
      throw new Error("targetSequence must be a finite number");
    }

    resolvedTarget = Math.floor(resolvedTarget);

    if (resolvedTarget < 0) {
      throw new Error("targetSequence must be >= 0");
    }

    if (resolvedTarget > latestSequence) {
      resolvedTarget = latestSequence;
    }

    const snapshot = this.snapshotService.getLatestBeforeOrAt(documentId, resolvedTarget);
    const baseBlocks = parseSnapshotBlocks(snapshot);

    const baseSequence = snapshot?.upToSequence ?? 0;
    const appliedOperations = this.operationLogStore
      .getSince(documentId, baseSequence)
      .filter((operation) => operation.sequence <= resolvedTarget);

    const blockById = new Map<string, Block>();
    for (const block of baseBlocks) {
      blockById.set(block.id, block);
    }

    for (const operation of appliedOperations) {
      if (operation.payload.type !== "replace_block") {
        continue;
      }

      const existing = blockById.get(operation.blockId);
      if (existing) {
        blockById.set(operation.blockId, {
          ...existing,
          text: operation.payload.text,
          version: operation.appliedBlockVersion,
          updatedAt: operation.createdAt
        });
      }
    }

    return {
      snapshot,
      targetSequence: resolvedTarget,
      appliedOperations,
      blocks: [...blockById.values()].sort((a, b) => a.orderKey - b.orderKey)
    };
  }
}

function parseSnapshotBlocks(snapshot?: Snapshot): Block[] {
  if (!snapshot) {
    return [];
  }

  const parsed = JSON.parse(snapshot.serializedBlockState) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Snapshot ${snapshot.id} is malformed`);
  }

  return parsed as Block[];
}
