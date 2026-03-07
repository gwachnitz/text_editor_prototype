import type { BlockStore } from "../stores/blockStore.js";
import type { DocumentStore } from "../stores/documentStore.js";
import type { OperationLogStore } from "../stores/operationLogStore.js";
import type { Block, OperationPayload, Operation } from "../types/model.js";

type SubmitOperationInput = {
  id: string;
  documentId: string;
  blockId: string;
  clientId: string;
  baseBlockVersion: number;
  payload: OperationPayload;
};

export class OperationService {
  constructor(
    private readonly blockStore: BlockStore,
    private readonly operationLogStore: OperationLogStore,
    private readonly documentStore: DocumentStore
  ) {}

  submitOperation(input: SubmitOperationInput): Operation {
    const currentBlock = this.blockStore.getBlock(input.documentId, input.blockId);
    if (!currentBlock) {
      throw new Error(`Block ${input.blockId} not found in document ${input.documentId}`);
    }

    if (input.payload.type !== "replace_block") {
      throw new Error("Only replace_block edits are supported by this prototype");
    }

    if (input.baseBlockVersion < currentBlock.version) {
      throw new StaleBlockVersionError(currentBlock, input.baseBlockVersion);
    }

    if (input.baseBlockVersion > currentBlock.version) {
      throw new Error(
        `Invalid baseBlockVersion ${input.baseBlockVersion} for block version ${currentBlock.version}`
      );
    }

    const updatedBlock = this.blockStore.applyDeterministicOperation(
      input.documentId,
      input.blockId,
      input.payload
    );

    const sequence = this.operationLogStore.getLatestSequence(input.documentId) + 1;

    const operation: Operation = {
      id: input.id,
      documentId: input.documentId,
      blockId: input.blockId,
      clientId: input.clientId,
      baseBlockVersion: input.baseBlockVersion,
      appliedBlockVersion: updatedBlock.version,
      sequence,
      payload: input.payload,
      createdAt: Date.now()
    };

    this.operationLogStore.append(operation);
    this.documentStore.touchDocument(input.documentId);

    return operation;
  }
}

export class StaleBlockVersionError extends Error {
  constructor(
    readonly authoritativeBlock: Block,
    readonly baseBlockVersion: number
  ) {
    super(
      `Stale baseBlockVersion ${baseBlockVersion}; authoritative version is ${authoritativeBlock.version}`
    );
    this.name = "StaleBlockVersionError";
  }
}
