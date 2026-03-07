import type { Operation } from "../types/model.js";

export class OperationLogStore {
  private readonly operationsByDoc = new Map<string, Operation[]>();

  append(operation: Operation): void {
    const operations = this.operationsByDoc.get(operation.documentId) ?? [];
    operations.push(operation);
    this.operationsByDoc.set(operation.documentId, operations);
  }

  getLatestSequence(documentId: string): number {
    return this.operationsByDoc.get(documentId)?.at(-1)?.sequence ?? 0;
  }

  getSince(documentId: string, sequenceExclusive: number): Operation[] {
    return (this.operationsByDoc.get(documentId) ?? []).filter(
      (entry) => entry.sequence > sequenceExclusive
    );
  }

  list(documentId: string): Operation[] {
    return [...(this.operationsByDoc.get(documentId) ?? [])];
  }
}
