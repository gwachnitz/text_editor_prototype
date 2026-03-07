import test from "node:test";
import assert from "node:assert/strict";
import { isClientToServerMessage } from "../server/messageValidation.js";

test("isClientToServerMessage accepts supported protocol messages", () => {
  assert.equal(
    isClientToServerMessage({
      type: "join_document",
      documentId: "d1",
      clientId: "c1",
      displayName: "Alpha"
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "load_range",
      documentId: "d1",
      startOrderKeyInclusive: 0,
      endOrderKeyExclusive: 10
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-1",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "replace_block",
          text: "next"
        }
      }
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-2",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "insert_text",
          offset: 0,
          text: "x"
        }
      }
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-3",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "delete_text",
          offset: 0,
          length: 3
        }
      }
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "presence_update",
      documentId: "d1",
      clientId: "c1",
      presence: {
        displayName: "Alpha",
        activeBlockId: "b1",
        cursorBlockId: "b1",
        cursorOffset: 2
      }
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "heartbeat",
      documentId: "d1",
      clientId: "c1"
    }),
    true
  );

  assert.equal(
    isClientToServerMessage({
      type: "request_resync",
      documentId: "d1",
      sinceSequence: 10
    }),
    true
  );
});

test("isClientToServerMessage rejects malformed payloads", () => {
  assert.equal(isClientToServerMessage(null), false);
  assert.equal(isClientToServerMessage({}), false);

  assert.equal(
    isClientToServerMessage({
      type: "join_document",
      documentId: "d1"
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "join_document",
      documentId: "d1",
      clientId: "c1",
      displayName: 123
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-1",
        blockId: "b1",
        baseBlockVersion: "1"
      }
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-2",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "insert_text",
          offset: "nope",
          text: "x"
        }
      }
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-3",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "delete_text",
          offset: 1,
          length: -2
        }
      }
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "edit_block",
      documentId: "d1",
      operation: {
        id: "op-4",
        blockId: "b1",
        baseBlockVersion: 1,
        payload: {
          type: "unknown",
          foo: "bar"
        }
      }
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "presence_update",
      documentId: "d1",
      clientId: "c1",
      presence: {
        cursorOffset: "bad"
      }
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "request_resync",
      documentId: "d1",
      sinceSequence: "3"
    }),
    false
  );

  assert.equal(
    isClientToServerMessage({
      type: "unknown",
      foo: "bar"
    }),
    false
  );
});
