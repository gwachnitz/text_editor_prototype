export type Operation = {
  kind: "insert_text" | "delete_text" | "replace_block";
  blockId: string;
  payload: unknown;
  clientTimestamp: number;
};

export type PresenceState = {
  status: "online" | "idle";
  cursorBlockId?: string;
  cursorOffset?: number;
};

export type ClientToServerMessage =
  | {
      type: "join_document";
      documentId: string;
      clientId: string;
    }
  | {
      type: "submit_operation";
      documentId: string;
      operation: Operation;
    }
  | {
      type: "presence_update";
      documentId: string;
      clientId: string;
      presence: PresenceState;
    };

export type ServerToClientMessage =
  | {
      type: "document_joined";
      documentId: string;
      serverRevision: number;
    }
  | {
      type: "operation_acked";
      documentId: string;
      sequence: number;
    }
  | {
      type: "presence_acked";
      documentId: string;
      clientId: string;
    }
  | {
      type: "error";
      message: string;
    };
