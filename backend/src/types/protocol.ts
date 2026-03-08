import type { Block, Document, OperationPayload, PresenceSession, Snapshot } from "./model.js";

export type PresenceState = {
  displayName?: string;
  activeBlockId?: string;
  cursorBlockId?: string;
  cursorOffset?: number;
};

export type SubmittedOperation = {
  id: string;
  blockId: string;
  baseBlockVersion: number;
  payload: Extract<OperationPayload, { type: "replace_block" }>;
};

export type SequencingMetadata = {
  latestSequence: number;
  latestSnapshotVersion: number;
};

export type ClientToServerMessage =
  | {
      type: "join_document";
      documentId: string;
      clientId: string;
      displayName?: string;
    }
  | {
      type: "load_range";
      documentId: string;
      startOrderKeyInclusive: number;
      endOrderKeyExclusive: number;
    }
  | {
      type: "edit_block";
      documentId: string;
      operation: SubmittedOperation;
    }
  | {
      type: "presence_update";
      documentId: string;
      clientId: string;
      presence: PresenceState;
    }
  | {
      type: "heartbeat";
      documentId: string;
      clientId: string;
    }
  | {
      type: "request_resync";
      documentId: string;
      sinceSequence: number;
    };

export type ServerToClientMessage =
  | {
      type: "document_joined";
      documentId: string;
      document: Document;
      totalBlocks: number;
      initialRange: {
        startOrderKeyInclusive: number;
        endOrderKeyExclusive: number;
      };
      presenceState: PresenceSession[];
      sequencing: SequencingMetadata;
    }
  | {
      type: "range_data";
      documentId: string;
      startOrderKeyInclusive: number;
      endOrderKeyExclusive: number;
      blocks: Block[];
    }
  | {
      type: "block_updated";
      documentId: string;
      sequence: number;
      block: Block;
      operation: SubmittedOperation;
      clientId: string;
    }
  | {
      type: "edit_accepted";
      documentId: string;
      operationId: string;
      sequence: number;
      appliedBlockVersion: number;
    }
  | {
      type: "edit_rejected";
      documentId: string;
      operationId: string;
      reason: string;
      authoritativeBlockVersion?: number;
      authoritativeBlockText?: string;
    }
  | {
      type: "presence_state";
      documentId: string;
      sessions: PresenceSession[];
    }
  | {
      type: "presence_diff";
      documentId: string;
      clientId: string;
      change: "joined" | "updated" | "left";
      session?: PresenceSession;
    }
  | {
      type: "snapshot_created";
      documentId: string;
      snapshot: Snapshot;
    }
  | {
      type: "resync_required";
      documentId: string;
      reason: string;
      sequencing: SequencingMetadata;
    }
  | {
      type: "error";
      message: string;
    };
