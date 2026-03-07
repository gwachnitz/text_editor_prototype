import test from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../stores/blockStore.js";
import { DocumentStore } from "../stores/documentStore.js";
import { SnapshotService } from "../services/snapshotService.js";
import { PresenceService } from "../services/presenceService.js";
import type { Block } from "../types/model.js";

test("BlockStore applies deterministic operations and increments version", () => {
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

  const inserted = store.applyDeterministicOperation("d1", "b1", {
    type: "insert_text",
    offset: 5,
    text: " world"
  });
  assert.equal(inserted.text, "hello world");
  assert.equal(inserted.version, 2);

  const deleted = store.applyDeterministicOperation("d1", "b1", {
    type: "delete_text",
    offset: 5,
    length: 99
  });
  assert.equal(deleted.text, "hello");
  assert.equal(deleted.version, 3);

  const replaced = store.applyDeterministicOperation("d1", "b1", {
    type: "replace_block",
    text: "reset"
  });
  assert.equal(replaced.text, "reset");
  assert.equal(replaced.version, 4);
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
