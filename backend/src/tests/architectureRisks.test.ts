import assert from "node:assert/strict";
import test from "node:test";
import type { WebSocket } from "ws";
import { DocumentSessionManager } from "../services/documentSessionManager.js";
import { OperationService } from "../services/operationService.js";
import { PresenceService } from "../services/presenceService.js";
import { RecoveryService } from "../services/recoveryService.js";
import { SnapshotService } from "../services/snapshotService.js";
import { BlockStore } from "../stores/blockStore.js";
import { DocumentStore } from "../stores/documentStore.js";
import { OperationLogStore } from "../stores/operationLogStore.js";
import type { Block, Document } from "../types/model.js";
import type { ServerToClientMessage } from "../types/protocol.js";

function createCoreFixture() {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();
  const operationLogStore = new OperationLogStore();
  const operationService = new OperationService(blockStore, operationLogStore, documentStore);

  documentStore.upsertDocument({
    id: "doc-1",
    title: "Risk doc",
    createdAt: 1,
    updatedAt: 1,
    latestSnapshotVersion: 0
  });

  blockStore.setDocumentBlocks("doc-1", [
    { id: "b-1", documentId: "doc-1", orderKey: 0, text: "start", version: 1, updatedAt: 1 },
    { id: "b-2", documentId: "doc-1", orderKey: 1, text: "next", version: 1, updatedAt: 1 }
  ]);

  return { documentStore, blockStore, operationLogStore, operationService };
}

test("accepts edit when base version matches", () => {
  const { operationService, blockStore } = createCoreFixture();

  const accepted = operationService.submitOperation({
    id: "op-1",
    documentId: "doc-1",
    blockId: "b-1",
    clientId: "c-1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "updated" }
  });

  assert.equal(accepted.sequence, 1);
  assert.equal(accepted.appliedBlockVersion, 2);
  assert.equal(blockStore.getBlock("doc-1", "b-1")?.text, "updated");
});

test("rejects stale edit when base version is behind authoritative block", () => {
  const { operationService } = createCoreFixture();

  operationService.submitOperation({
    id: "op-1",
    documentId: "doc-1",
    blockId: "b-1",
    clientId: "c-1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "first" }
  });

  assert.throws(
    () =>
      operationService.submitOperation({
        id: "op-2",
        documentId: "doc-1",
        blockId: "b-1",
        clientId: "c-2",
        baseBlockVersion: 1,
        payload: { type: "replace_block", text: "stale" }
      }),
    /Stale baseBlockVersion/
  );
});

test("accepted operations are assigned monotonically increasing sequence numbers", () => {
  const { operationService, operationLogStore } = createCoreFixture();

  const first = operationService.submitOperation({
    id: "op-1",
    documentId: "doc-1",
    blockId: "b-1",
    clientId: "c-1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "a" }
  });
  const second = operationService.submitOperation({
    id: "op-2",
    documentId: "doc-1",
    blockId: "b-2",
    clientId: "c-2",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "b" }
  });
  const third = operationService.submitOperation({
    id: "op-3",
    documentId: "doc-1",
    blockId: "b-1",
    clientId: "c-1",
    baseBlockVersion: 2,
    payload: { type: "replace_block", text: "c" }
  });

  assert.deepEqual([first.sequence, second.sequence, third.sequence], [1, 2, 3]);
  assert.equal(operationLogStore.getLatestSequence("doc-1"), 3);
});

test("snapshot and reconstruction recreate latest document state", () => {
  const { blockStore, documentStore, operationLogStore, operationService } = createCoreFixture();
  const snapshotService = new SnapshotService(blockStore, documentStore, 100);

  operationService.submitOperation({
    id: "op-1",
    documentId: "doc-1",
    blockId: "b-1",
    clientId: "c-1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "from-snapshot" }
  });

  const snapshot = snapshotService.createSnapshot("doc-1", operationLogStore.getLatestSequence("doc-1"));

  operationService.submitOperation({
    id: "op-2",
    documentId: "doc-1",
    blockId: "b-2",
    clientId: "c-1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "after-snapshot" }
  });

  const recoveryService = new RecoveryService(operationLogStore, snapshotService);
  const reconstructed = recoveryService.reconstructDocumentState("doc-1");

  assert.equal(reconstructed.snapshot?.id, snapshot.id);
  assert.equal(reconstructed.blocks.find((block) => block.id === "b-1")?.text, "from-snapshot");
  assert.equal(reconstructed.blocks.find((block) => block.id === "b-2")?.text, "after-snapshot");
});

test("presence expires sessions that miss heartbeat timeout", () => {
  const service = new PresenceService(100);
  let now = 1000;
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    service.join("doc-1", "c-1", "Alpha");

    now = 1050;
    service.join("doc-1", "c-2", "Beta");

    now = 1149;
    const active = service.list("doc-1");
    assert.deepEqual(active.map((session) => session.clientId), ["c-2"]);
  } finally {
    Date.now = originalNow;
  }
});

class MockSocket {
  readonly messages: ServerToClientMessage[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerToClientMessage);
  }
}

function asSocket(socket: MockSocket): WebSocket {
  return socket as unknown as WebSocket;
}

function createSessionFixture() {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();
  const operationLogStore = new OperationLogStore();
  const operationService = new OperationService(blockStore, operationLogStore, documentStore);
  const snapshotService = new SnapshotService(blockStore, documentStore, 100);
  const presenceService = new PresenceService(30_000);

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

  return manager;
}

test("join_document seeds session and load_range returns focused block range", () => {
  const manager = createSessionFixture();
  const alpha = new MockSocket();

  manager.handleClientMessage(asSocket(alpha), {
    type: "join_document",
    documentId: "doc-1",
    clientId: "c-1",
    displayName: "Alpha"
  });

  manager.handleClientMessage(asSocket(alpha), {
    type: "load_range",
    documentId: "doc-1",
    startOrderKeyInclusive: 1,
    endOrderKeyExclusive: 2
  });

  const joined = alpha.messages.find((message) => message.type === "document_joined");
  assert.ok(joined);

  const rangeData = alpha.messages.find(
    (message): message is Extract<ServerToClientMessage, { type: "range_data" }> =>
      message.type === "range_data"
  );
  assert.ok(rangeData);
  assert.deepEqual(rangeData.blocks.map((block) => block.id), ["b-2"]);
});

test("edit broadcasts accepted operation to all other clients in the document", () => {
  const manager = createSessionFixture();
  const author = new MockSocket();
  const beta = new MockSocket();
  const gamma = new MockSocket();

  const clients: Array<{ socket: MockSocket; clientId: string; displayName: string }> = [
    { socket: author, clientId: "c-1", displayName: "Alpha" },
    { socket: beta, clientId: "c-2", displayName: "Beta" },
    { socket: gamma, clientId: "c-3", displayName: "Gamma" }
  ];

  for (const { socket, clientId, displayName } of clients) {
    manager.handleClientMessage(asSocket(socket), {
      type: "join_document",
      documentId: "doc-1",
      clientId,
      displayName
    });
  }

  manager.handleClientMessage(asSocket(author), {
    type: "edit_block",
    documentId: "doc-1",
    operation: {
      id: "op-1",
      blockId: "b-1",
      baseBlockVersion: 1,
      payload: { type: "replace_block", text: "broadcasted" }
    }
  });

  const authorBroadcast = author.messages.find((message) => message.type === "block_updated");
  assert.equal(authorBroadcast, undefined);

  const betaBroadcast = beta.messages.find((message) => message.type === "block_updated");
  const gammaBroadcast = gamma.messages.find((message) => message.type === "block_updated");
  assert.ok(betaBroadcast);
  assert.ok(gammaBroadcast);
});
