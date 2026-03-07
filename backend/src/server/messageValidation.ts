import type { ClientToServerMessage } from "../types/protocol.js";

export function isClientToServerMessage(value: unknown): value is ClientToServerMessage {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "join_document":
      return typeof value.documentId === "string" && typeof value.clientId === "string";

    case "load_range":
      return (
        typeof value.documentId === "string" &&
        typeof value.startOrderKeyInclusive === "number" &&
        typeof value.endOrderKeyExclusive === "number"
      );

    case "edit_block":
      return (
        typeof value.documentId === "string" &&
        isObject(value.operation) &&
        typeof value.operation.id === "string" &&
        typeof value.operation.blockId === "string" &&
        typeof value.operation.baseBlockVersion === "number" &&
        isObject(value.operation.payload) &&
        typeof value.operation.payload.type === "string"
      );

    case "presence_update":
      return (
        typeof value.documentId === "string" &&
        typeof value.clientId === "string" &&
        isObject(value.presence)
      );

    case "heartbeat":
      return typeof value.documentId === "string" && typeof value.clientId === "string";

    case "request_resync":
      return typeof value.documentId === "string" && typeof value.sinceSequence === "number";

    default:
      return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
