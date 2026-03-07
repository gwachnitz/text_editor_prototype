import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotService } from "../services/snapshotService.js";
import { PresenceService } from "../services/presenceService.js";
import { OperationService } from "../services/operationService.js";
import { RecoveryService } from "../services/recoveryService.js";
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

test("PresenceService heartbeat upserts minimal session when missing", () => {
  const service = new PresenceService();
  service.heartbeat("d1", "c-missing");

  const active = service.list("d1");
  assert.equal(active.length, 1);
  assert.equal(active[0].clientId, "c-missing");
  assert.equal(active[0].displayName, "Anonymous");
});

test("RecoveryService reconstructs block state from snapshot + later operations", () => {
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
    { id: "b1", documentId: "d1", orderKey: 0, text: "start", version: 1, updatedAt: 10 }
  ]);

  operationService.submitOperation({
    id: "op-1",
    documentId: "d1",
    blockId: "b1",
    clientId: "c1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "line-1" }
  });

  const snapshotService = new SnapshotService(blockStore, documentStore, 20);
  snapshotService.createSnapshot("d1", operationLogStore.getLatestSequence("d1"));

  operationService.submitOperation({
    id: "op-2",
    documentId: "d1",
    blockId: "b1",
    clientId: "c1",
    baseBlockVersion: 2,
    payload: { type: "replace_block", text: "line-2" }
  });

  const recoveryService = new RecoveryService(operationLogStore, snapshotService);
  const reconstructed = recoveryService.reconstructDocumentState("d1");

  assert.equal(reconstructed.snapshot?.upToSequence, 1);
  assert.equal(reconstructed.appliedOperations.length, 1);
  assert.equal(reconstructed.blocks[0]?.text, "line-2");
  assert.equal(reconstructed.blocks[0]?.version, 3);
});

test("RecoveryService validates targetSequence and clamps to latest", () => {
  const documentStore = new DocumentStore();
  const blockStore = new BlockStore();
  const operationLogStore = new OperationLogStore();
  const operationService = new OperationService(blockStore, operationLogStore, documentStore);
  const snapshotService = new SnapshotService(blockStore, documentStore, 20);
  const recoveryService = new RecoveryService(operationLogStore, snapshotService);

  documentStore.upsertDocument({
    id: "d1",
    title: "Doc",
    createdAt: 10,
    updatedAt: 10,
    latestSnapshotVersion: 0
  });

  blockStore.setDocumentBlocks("d1", [
    { id: "b1", documentId: "d1", orderKey: 0, text: "start", version: 1, updatedAt: 10 }
  ]);

  operationService.submitOperation({
    id: "op-1",
    documentId: "d1",
    blockId: "b1",
    clientId: "c1",
    baseBlockVersion: 1,
    payload: { type: "replace_block", text: "latest" }
  });

  assert.throws(() => recoveryService.reconstructDocumentState("d1", Number.NaN), /finite number/);
  assert.throws(
    () => recoveryService.reconstructDocumentState("d1", Number.POSITIVE_INFINITY),
    /finite number/
  );

  const clamped = recoveryService.reconstructDocumentState("d1", 999);
  assert.equal(clamped.targetSequence, 1);
});

test("OperationLogStore.listRecent returns tail subset", () => {
  const store = new OperationLogStore();
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    store.append({
      id: `op-${sequence}`,
      documentId: "d1",
      blockId: "b1",
      clientId: "c1",
      baseBlockVersion: sequence,
      appliedBlockVersion: sequence + 1,
      sequence,
      payload: { type: "replace_block", text: `v${sequence}` },
      createdAt: sequence
    });
  }

  assert.deepEqual(
    store.listRecent("d1", 2).map((entry) => entry.id),
    ["op-2", "op-3"]
  );

  assert.deepEqual(store.listRecent("d1", Number.NaN), []);
  assert.deepEqual(store.listRecent("d1", Number.POSITIVE_INFINITY), []);
});
