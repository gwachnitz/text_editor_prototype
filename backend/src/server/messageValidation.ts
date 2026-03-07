import type { ClientToServerMessage } from "../types/protocol.js";

export function isClientToServerMessage(value: unknown): value is ClientToServerMessage {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "join_document":
      return (
        typeof value.documentId === "string" &&
        typeof value.clientId === "string" &&
        (value.displayName === undefined || typeof value.displayName === "string")
      );

    case "load_range":
      return (
        typeof value.documentId === "string" &&
        isFiniteNumber(value.startOrderKeyInclusive) &&
        isFiniteNumber(value.endOrderKeyExclusive)
      );

    case "edit_block":
      return (
        typeof value.documentId === "string" &&
        isObject(value.operation) &&
        typeof value.operation.id === "string" &&
        typeof value.operation.blockId === "string" &&
        isFiniteNumber(value.operation.baseBlockVersion) &&
        Number.isInteger(value.operation.baseBlockVersion) &&
        value.operation.baseBlockVersion >= 0 &&
        isOperationPayload(value.operation.payload)
      );

    case "presence_update":
      return (
        typeof value.documentId === "string" &&
        typeof value.clientId === "string" &&
        isPresenceState(value.presence)
      );

    case "heartbeat":
      return typeof value.documentId === "string" && typeof value.clientId === "string";

    case "request_resync":
      return (
        typeof value.documentId === "string" &&
        isFiniteNumber(value.sinceSequence) &&
        Number.isInteger(value.sinceSequence) &&
        value.sinceSequence >= 0
      );

    default:
      return false;
  }
}

function isOperationPayload(value: unknown): boolean {
  return (
    isObject(value) &&
    value.type === "replace_block" &&
    typeof value.text === "string"
  );
}

function isPresenceState(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    (value.displayName === undefined || typeof value.displayName === "string") &&
    (value.activeBlockId === undefined || typeof value.activeBlockId === "string") &&
    (value.cursorBlockId === undefined || typeof value.cursorBlockId === "string") &&
    (value.cursorOffset === undefined || isFiniteNumber(value.cursorOffset))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
