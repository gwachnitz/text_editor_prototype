import test from "node:test";
import assert from "node:assert/strict";
import type { WebSocket } from "ws";
import { DocumentSessionManager } from "../services/documentSessionManager.js";
import { OperationService } from "../services/operationService.js";
import { PresenceService } from "../services/presenceService.js";
import { SnapshotService } from "../services/snapshotService.js";
import { BlockStore } from "../stores/blockStore.js";
import { DocumentStore } from "../stores/documentStore.js";
import { OperationLogStore } from "../stores/operationLogStore.js";
import type { Block, Document } from "../types/model.js";
import type { ClientToServerMessage, ServerToClientMessage } from "../types/protocol.js";

class MockSocket {
  readonly messages: ServerToClientMessage[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerToClientMessage);
  }
}

function createFixture() {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();
  const operationLogStore = new OperationLogStore();
  const operationService = new OperationService(blockStore, operationLogStore, documentStore);
  const snapshotService = new SnapshotService(blockStore, documentStore, 1);
  const presenceService = new PresenceService();

  const doc: Document = {
    id: "doc-1",
    title: "Protocol doc",
    createdAt: 1,
    updatedAt: 1,
    latestSnapshotVersion: 0
  };

  const blocks: Block[] = [
    { id: "b-1", documentId: "doc-1", orderKey: 0, text: "hello", version: 1, updatedAt: 1 },
    { id: "b-2", documentId: "doc-1", orderKey: 1, text: "world", version: 1, updatedAt: 1 }
  ];

  documentStore.upsertDocument(doc);
  blockStore.setDocumentBlocks(doc.id, blocks);

  const manager = new DocumentSessionManager({
    blockStore,
    documentStore,
    operationLogStore,
    operationService,
    snapshotService,
    presenceService
  });

  return { manager, blockStore };
}

function message<T extends ServerToClientMessage["type"]>(
  socket: MockSocket,
  type: T
): Extract<ServerToClientMessage, { type: T }> {
  const hit = [...socket.messages].reverse().find((item) => item.type === type);
  assert.ok(hit);
  return hit as Extract<ServerToClientMessage, { type: T }>;
}

function asSocket(socket: MockSocket): WebSocket {
  return socket as unknown as WebSocket;
}

test("join_document returns metadata/presence and notifies collaborators", () => {
  const { manager } = createFixture();
  const first = new MockSocket();
  const second = new MockSocket();

  manager.handleClientMessage(asSocket(first), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-1",
    displayName: "Alpha"
  });

  manager.handleClientMessage(asSocket(second), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-2",
    displayName: "Beta"
  });

  const joined = message(second, "document_joined");
  assert.equal(joined.documentId, "doc-1");
  assert.equal(joined.document.title, "Protocol doc");
  assert.equal(joined.sequencing.latestSequence, 0);

  const state = message(second, "presence_state");
  assert.deepEqual(
    state.sessions.map((item) => item.clientId).sort(),
    ["c-1", "c-2"]
  );

  const diff = message(first, "presence_diff");
  assert.equal(diff.change, "joined");
  assert.equal(diff.clientId, "c-2");
});

test("load_range and edit_block dispatch expected protocol messages", () => {
  const { manager, blockStore } = createFixture();
  const socket = new MockSocket();

  manager.handleClientMessage(asSocket(socket), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-1",
    displayName: "Alpha"
  });

  const loadRange: ClientToServerMessage = {
    type: "load_range",
    documentId: "doc-1",
    startOrderKeyInclusive: 0,
    endOrderKeyExclusive: 1
  };
  manager.handleClientMessage(asSocket(socket), loadRange);

  const rangeData = message(socket, "range_data");
  assert.deepEqual(rangeData.blocks.map((block) => block.id), ["b-1"]);

  manager.handleClientMessage(asSocket(socket), {
    type: "edit_block",
    documentId: "doc-1",
    operation: {
      id: "op-1",
      blockId: "b-1",
      baseBlockVersion: 1,
      payload: { type: "insert_text", offset: 5, text: "!" }
    }
  });

  const editAccepted = message(socket, "edit_accepted");
  assert.equal(editAccepted.operationId, "op-1");
  assert.equal(editAccepted.sequence, 1);
  assert.equal(blockStore.getBlock("doc-1", "b-1")?.text, "hello!");

  const broadcast = message(socket, "block_updated");
  assert.equal(broadcast.sequence, 1);

  const snapshot = message(socket, "snapshot_created");
  assert.equal(snapshot.snapshot.upToSequence, 1);
});

test("edit_block with stale base returns edit_rebased and invalid base returns reject/resync", () => {
  const { manager } = createFixture();
  const socket = new MockSocket();

  manager.handleClientMessage(asSocket(socket), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-1",
    displayName: "Alpha"
  });

  manager.handleClientMessage(asSocket(socket), {
    type: "edit_block",
    documentId: "doc-1",
    operation: {
      id: "op-1",
      blockId: "b-1",
      baseBlockVersion: 1,
      payload: { type: "insert_text", offset: 5, text: "!" }
    }
  });

  manager.handleClientMessage(asSocket(socket), {
    type: "edit_block",
    documentId: "doc-1",
    operation: {
      id: "op-2",
      blockId: "b-1",
      baseBlockVersion: 1,
      payload: { type: "insert_text", offset: 6, text: "?" }
    }
  });

  const rebased = message(socket, "edit_rebased");
  assert.equal(rebased.operationId, "op-2");
  assert.equal(rebased.serverBlockVersionAtApply, 2);

  manager.handleClientMessage(asSocket(socket), {
    type: "edit_block",
    documentId: "doc-1",
    operation: {
      id: "op-3",
      blockId: "b-1",
      baseBlockVersion: 999,
      payload: { type: "replace_block", text: "bad" }
    }
  });

  const rejected = message(socket, "edit_rejected");
  assert.equal(rejected.operationId, "op-3");

  const resync = message(socket, "resync_required");
  assert.equal(resync.documentId, "doc-1");
});

test("presence_update, heartbeat, request_resync, and disconnect are handled", () => {
  const { manager } = createFixture();
  const alpha = new MockSocket();
  const beta = new MockSocket();

  manager.handleClientMessage(asSocket(alpha), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-1",
    displayName: "Alpha"
  });
  manager.handleClientMessage(asSocket(beta), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-2",
    displayName: "Beta"
  });

  manager.handleClientMessage(asSocket(alpha), {
    type: "presence_update",
    documentId: "doc-1",
    clientId: "c-1",
    presence: {
      activeBlockId: "b-2",
      cursorBlockId: "b-2",
      cursorOffset: 3
    }
  });

  const updatedPresence = message(alpha, "presence_diff");
  assert.equal(updatedPresence.change, "updated");

  manager.handleClientMessage(asSocket(alpha), {
    type: "heartbeat",
    documentId: "doc-1",
    clientId: "c-1"
  });

  manager.handleClientMessage(asSocket(alpha), {
    type: "request_resync",
    documentId: "doc-1",
    sinceSequence: 0
  });
  const resync = message(alpha, "resync_required");
  assert.equal(resync.reason.includes("requested resync"), true);

  manager.handleClientDisconnect(asSocket(alpha));

  const leftMessage = message(beta, "presence_diff");
  assert.equal(leftMessage.change, "left");
  assert.equal(leftMessage.clientId, "c-1");
});
