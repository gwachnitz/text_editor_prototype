import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotService } from "../services/snapshotService.js";
import { PresenceService } from "../services/presenceService.js";
import { OperationService } from "../services/operationService.js";
import { BlockStore } from "../stores/blockStore.js";
import { DocumentStore } from "../stores/documentStore.js";
import { OperationLogStore } from "../stores/operationLogStore.js";
import type { Block } from "../types/model.js";

test("BlockStore applies replace operations and increments version", () => {
  const store = new BlockStore();
  const block: Block = {
    id: "b1",
    documentId: "d1",
    orderKey: 0,
    text: "hello",
    version: 1,
    updatedAt: 1
  };

  store.setDocumentBlocks("d1", [block]);

  const replaced = store.applyDeterministicOperation("d1", "b1", {
    type: "replace_block",
    text: "reset"
  });
  assert.equal(replaced.text, "reset");
  assert.equal(replaced.version, 2);
});

test("BlockStore retrieves blocks by order range", () => {
  const store = new BlockStore();
  const blocks: Block[] = [
    { id: "b1", documentId: "d1", orderKey: 0, text: "a", version: 1, updatedAt: 1 },
    { id: "b2", documentId: "d1", orderKey: 1, text: "b", version: 1, updatedAt: 1 },
    { id: "b3", documentId: "d1", orderKey: 2, text: "c", version: 1, updatedAt: 1 }
  ];

  store.setDocumentBlocks("d1", blocks);

  assert.deepEqual(
    store.getBlocksInRange("d1", 1, 3).map((item) => item.id),
    ["b2", "b3"]
  );
});

test("OperationService accepts exact base versions and rejects stale/future versions", () => {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();
  const operationLogStore = new OperationLogStore();
  const operationService = new OperationService(blockStore, operationLogStore, documentStore);

  documentStore.upsertDocument({
    id: "d1",
    title: "Doc",
    createdAt: 10,
    updatedAt: 10,
    latestSnapshotVersion: 0
  });

  blockStore.setDocumentBlocks("d1", [
    { id: "b1", documentId: "d1", orderKey: 0, text: "abc", version: 1, updatedAt: 10 }
  ]);

  const accepted = operationService.submitOperation({
    id: "op-1",
    documentId: "d1",
    blockId: "b1",
    clientId: "c1",
    baseBlockVersion: 1,
    payload: {
      type: "replace_block",
      text: "abc!"
    }
  });

  assert.equal(accepted.appliedBlockVersion, 2);
  assert.equal(accepted.sequence, 1);
  assert.equal(blockStore.getBlock("d1", "b1")?.text, "abc!");

  assert.throws(
    () =>
      operationService.submitOperation({
        id: "op-2",
        documentId: "d1",
        blockId: "b1",
        clientId: "c1",
        baseBlockVersion: 1,
        payload: {
          type: "replace_block",
          text: "stale"
        }
      }),
    /Stale baseBlockVersion/
  );

  assert.throws(
    () =>
      operationService.submitOperation({
        id: "op-3",
        documentId: "d1",
        blockId: "b1",
        clientId: "c1",
        baseBlockVersion: 999,
        payload: {
          type: "replace_block",
          text: "will-fail"
        }
      }),
    /Invalid baseBlockVersion/
  );
});

test("SnapshotService creates periodic snapshots and supports lookup", () => {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();

  documentStore.upsertDocument({
    id: "d1",
    title: "Doc",
    createdAt: 10,
    updatedAt: 10,
    latestSnapshotVersion: 0
  });

  blockStore.setDocumentBlocks("d1", [
    { id: "b1", documentId: "d1", orderKey: 0, text: "line", version: 1, updatedAt: 10 }
  ]);

  const snapshotService = new SnapshotService(blockStore, documentStore, 2);

  assert.equal(snapshotService.maybeCreateSnapshot("d1", 1), undefined);
  const snapshot = snapshotService.maybeCreateSnapshot("d1", 2);
  assert.ok(snapshot);
  assert.equal(snapshot?.upToSequence, 2);
  assert.equal(documentStore.getDocument("d1")?.latestSnapshotVersion, 2);

  const latest = snapshotService.getLatestBeforeOrAt("d1", 3);
  assert.equal(latest?.id, snapshot?.id);
});

test("PresenceService expires stale sessions", () => {
  const nowValues = [1000, 1200, 1700, 1900];
  const originalNow = Date.now;
  Date.now = () => nowValues.shift() ?? 1600;

  try {
    const service = new PresenceService(300);
    service.join("d1", "c1", "Alpha");
    service.join("d1", "c2", "Beta");

    service.heartbeat("d1", "c2");

    const active = service.list("d1");
    assert.deepEqual(active.map((item) => item.clientId), ["c2"]);
  } finally {
    Date.now = originalNow;
  }
});
