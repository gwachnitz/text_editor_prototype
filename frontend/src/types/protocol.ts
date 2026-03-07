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

export type PresenceState = {
  displayName?: string;
  activeBlockId?: string;
  cursorBlockId?: string;
  cursorOffset?: number;
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
      sequencing: {
        latestSequence: number;
        latestSnapshotVersion: number;
      };
      initialRange: {
        startOrderKeyInclusive: number;
        endOrderKeyExclusive: number;
      };
      document: {
        id: string;
        title: string;
      };
    }
  | {
      type: "range_data";
      documentId: string;
      startOrderKeyInclusive: number;
      endOrderKeyExclusive: number;
      blocks: Array<{
        id: string;
        documentId: string;
        orderKey: number;
        text: string;
        version: number;
      }>;
    }
  | {
      type: "block_updated";
      documentId: string;
      sequence: number;
      clientId: string;
      block: {
        id: string;
        documentId: string;
        orderKey: number;
        text: string;
        version: number;
      };
      operation: SubmittedOperation;
    }
  | {
      type: "edit_accepted" | "edit_rebased" | "edit_rejected";
      documentId: string;
      operationId: string;
      reason?: string;
      sequence?: number;
      appliedBlockVersion?: number;
      baseBlockVersion?: number;
      serverBlockVersionAtApply?: number;
    }
  | {
      type: "presence_state" | "presence_diff";
      documentId: string;
      clientId?: string;
      change?: "joined" | "updated" | "left";
    }
  | {
      type: "snapshot_created";
      documentId: string;
      snapshot: { id: string; upToSequence: number };
    }
  | {
      type: "resync_required";
      documentId: string;
      reason: string;
      sequencing: {
        latestSequence: number;
        latestSnapshotVersion: number;
      };
    }
  | {
      type: "error";
      message: string;
    };
