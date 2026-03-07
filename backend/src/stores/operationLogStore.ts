import type { Operation } from "../types/protocol.js";

type SequencedOperation = {
  sequence: number;
  operation: Operation;
};

export class OperationLogStore {
  private readonly operationsByDoc = new Map<string, SequencedOperation[]>();

  append(documentId: string, operation: Operation): number {
    const operations = this.operationsByDoc.get(documentId) ?? [];
    const sequence = operations.length + 1;

    operations.push({ sequence, operation });
    this.operationsByDoc.set(documentId, operations);

    return sequence;
  }

  getLatestSequence(documentId: string): number {
    return this.operationsByDoc.get(documentId)?.at(-1)?.sequence ?? 0;
  }

  getSince(documentId: string, sequenceExclusive: number): SequencedOperation[] {
    return (this.operationsByDoc.get(documentId) ?? []).filter(
      (entry) => entry.sequence > sequenceExclusive
    );
  }
}
