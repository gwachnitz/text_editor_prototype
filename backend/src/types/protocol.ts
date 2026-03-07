import type { OperationPayload } from "./model.js";

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
  payload: OperationPayload;
};

export type ClientToServerMessage =
  | {
      type: "join_document";
      documentId: string;
      clientId: string;
      displayName?: string;
    }
  | {
      type: "submit_operation";
      documentId: string;
      operation: SubmittedOperation;
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
      appliedBlockVersion: number;
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
