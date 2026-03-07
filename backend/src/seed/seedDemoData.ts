import type { Block, Document } from "../types/model.js";
import type { BlockStore } from "../stores/blockStore.js";
import type { DocumentStore } from "../stores/documentStore.js";

const now = () => Date.now();

export const DEMO_SMALL_DOCUMENT_ID = "doc-small";
export const DEMO_LARGE_DOCUMENT_ID = "doc-large";

export function seedDemoData(documentStore: DocumentStore, blockStore: BlockStore): void {
  const smallDoc = makeDocument(DEMO_SMALL_DOCUMENT_ID, "Quick Notes");
  const smallBlocks: Block[] = [
    makeBlock("small-1", smallDoc.id, 0, "This is a collaborative editor prototype."),
    makeBlock("small-2", smallDoc.id, 1, "Changes are sequenced by the backend."),
    makeBlock("small-3", smallDoc.id, 2, "Snapshots are taken periodically.")
  ];

  const largeDoc = makeDocument(DEMO_LARGE_DOCUMENT_ID, "Large Seed Document");
  const largeBlocks = Array.from({ length: 120 }, (_, index) =>
    makeBlock(
      `large-${index + 1}`,
      largeDoc.id,
      index,
      `Seed paragraph ${index + 1}. Lorem ipsum dolor sit amet ${index + 1}.`
    )
  );

  documentStore.upsertDocument(smallDoc);
  documentStore.upsertDocument(largeDoc);

  blockStore.setDocumentBlocks(smallDoc.id, smallBlocks);
  blockStore.setDocumentBlocks(largeDoc.id, largeBlocks);
}

function makeDocument(id: string, title: string): Document {
  const timestamp = now();
  return {
    id,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestSnapshotVersion: 0
  };
}

function makeBlock(id: string, documentId: string, orderKey: number, text: string): Block {
  return {
    id,
    documentId,
    orderKey,
    text,
    version: 1,
    updatedAt: now()
  };
}
