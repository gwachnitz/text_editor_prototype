export type Document = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  latestSnapshotVersion: number;
};

export type Block = {
  id: string;
  documentId: string;
  orderKey: number;
  text: string;
  version: number;
  updatedAt: number;
};

export type OperationPayload =
  | { type: "insert_text"; offset: number; text: string }
  | { type: "delete_text"; offset: number; length: number }
  | { type: "replace_block"; text: string };

export type SubmittedOperation = {
  id: string;
  blockId: string;
  baseBlockVersion: number;
  payload: OperationPayload;
};

export type PresenceSession = {
  clientId: string;
  displayName: string;
  documentId: string;
  activeBlockId?: string;
  cursor?: {
    blockId?: string;
    offset?: number;
  };
  lastHeartbeatAt: number;
};

export type PresenceState = {
  displayName?: string;
  activeBlockId?: string;
  cursorBlockId?: string;
  cursorOffset?: number;
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
      type: "edit_rebased";
      documentId: string;
      operationId: string;
      sequence: number;
      baseBlockVersion: number;
      serverBlockVersionAtApply: number;
      appliedBlockVersion: number;
    }
  | {
      type: "edit_rejected";
      documentId: string;
      operationId: string;
      reason: string;
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
      snapshot: {
        id: string;
        documentId: string;
        createdAt: number;
        upToSequence: number;
        serializedBlockState: string;
      };
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
