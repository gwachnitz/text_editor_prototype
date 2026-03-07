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

export type InsertTextPayload = {
  type: "insert_text";
  offset: number;
  text: string;
};

export type DeleteTextPayload = {
  type: "delete_text";
  offset: number;
  length: number;
};

export type ReplaceBlockPayload = {
  type: "replace_block";
  text: string;
};

export type OperationPayload = InsertTextPayload | DeleteTextPayload | ReplaceBlockPayload;

export type Operation = {
  id: string;
  documentId: string;
  blockId: string;
  clientId: string;
  baseBlockVersion: number;
  appliedBlockVersion: number;
  sequence: number;
  payload: OperationPayload;
  createdAt: number;
};

export type Snapshot = {
  id: string;
  documentId: string;
  createdAt: number;
  upToSequence: number;
  serializedBlockState: string;
};

export type CursorInfo = {
  blockId?: string;
  offset?: number;
};

export type PresenceSession = {
  clientId: string;
  displayName: string;
  documentId: string;
  activeBlockId?: string;
  cursor?: CursorInfo;
  lastHeartbeatAt: number;
};
