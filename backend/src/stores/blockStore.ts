import type { Block } from "../types/protocol.js";

export class BlockStore {
  private readonly blocksByDoc = new Map<string, Map<string, Block>>();

  getDocumentBlocks(documentId: string): Block[] {
    return [...(this.blocksByDoc.get(documentId)?.values() ?? [])];
  }

  upsertBlock(documentId: string, block: Block): void {
    if (!this.blocksByDoc.has(documentId)) {
      this.blocksByDoc.set(documentId, new Map());
    }

    this.blocksByDoc.get(documentId)?.set(block.id, block);
  }
}
