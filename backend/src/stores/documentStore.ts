import type { Document } from "../types/model.js";

export class DocumentStore {
  private readonly documents = new Map<string, Document>();

  listDocuments(): Document[] {
    return [...this.documents.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  getDocument(documentId: string): Document | undefined {
    return this.documents.get(documentId);
  }

  upsertDocument(document: Document): void {
    this.documents.set(document.id, document);
  }

  touchDocument(documentId: string): void {
    const existing = this.documents.get(documentId);
    if (!existing) {
      return;
    }

    existing.updatedAt = Date.now();
    this.documents.set(documentId, existing);
  }

  setLatestSnapshotVersion(documentId: string, version: number): void {
    const existing = this.documents.get(documentId);
    if (!existing) {
      return;
    }

    existing.latestSnapshotVersion = version;
    existing.updatedAt = Date.now();
    this.documents.set(documentId, existing);
  }
}
