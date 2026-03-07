import test from "node:test";
import assert from "node:assert/strict";
import { isClientToServerMessage } from "../server/messageValidation.js";

test("isClientToServerMessage accepts supported protocol messages", () => {
  assert.equal(
    isClientToServerMessage({
      type: "join_document",
      documentId: "d1",
      clientId: "c1"
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
      type: "presence_update",
      documentId: "d1",
      clientId: "c1",
      presence: {
        activeBlockId: "b1"
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
