import type { Block, OperationPayload } from "../types/model.js";

export class BlockStore {
  private readonly blocksByDoc = new Map<string, Map<string, Block>>();

  setDocumentBlocks(documentId: string, blocks: Block[]): void {
    const byId = new Map<string, Block>();
    for (const block of blocks) {
      byId.set(block.id, block);
    }
    this.blocksByDoc.set(documentId, byId);
  }

  getDocumentBlocks(documentId: string): Block[] {
    return [...(this.blocksByDoc.get(documentId)?.values() ?? [])].sort(
      (a, b) => a.orderKey - b.orderKey
    );
  }

  getBlocksInRange(documentId: string, startInclusive: number, endExclusive: number): Block[] {
    return this.getDocumentBlocks(documentId).filter(
      (block) => block.orderKey >= startInclusive && block.orderKey < endExclusive
    );
  }

  getBlock(documentId: string, blockId: string): Block | undefined {
    return this.blocksByDoc.get(documentId)?.get(blockId);
  }

  upsertBlock(documentId: string, block: Block): void {
    if (!this.blocksByDoc.has(documentId)) {
      this.blocksByDoc.set(documentId, new Map());
    }

    this.blocksByDoc.get(documentId)?.set(block.id, block);
  }

  applyDeterministicOperation(
    documentId: string,
    blockId: string,
    payload: OperationPayload
  ): Block {
    const block = this.getBlock(documentId, blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found in document ${documentId}`);
    }

    let nextText = block.text;
    if (payload.type === "insert_text") {
      const offset = clamp(payload.offset, 0, nextText.length);
      nextText = `${nextText.slice(0, offset)}${payload.text}${nextText.slice(offset)}`;
    } else if (payload.type === "delete_text") {
      const start = clamp(payload.offset, 0, nextText.length);
      const end = clamp(start + payload.length, start, nextText.length);
      nextText = `${nextText.slice(0, start)}${nextText.slice(end)}`;
    } else {
      nextText = payload.text;
    }

    const updated: Block = {
      ...block,
      text: nextText,
      version: block.version + 1,
      updatedAt: Date.now()
    };

    this.upsertBlock(documentId, updated);
    return updated;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
