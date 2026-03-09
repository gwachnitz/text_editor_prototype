# Realtime Block Editor (Prototype)

> **This repository is a prototype, not a production-ready system.**

This project demonstrates a minimal collaborative editor where multiple browser tabs can join the same document, edit blocks, and receive near real-time updates through a server-authoritative WebSocket protocol.

## What the prototype demonstrates

- Two clients can join the same document and collaborate in near real time.
- Presence is visible (who is online + active block).
- Editing is block-scoped, not whole-document replacement.
- Operations are sequenced on the server and appended to an operation log.
- Snapshots are created periodically and can be used for reconstruction.
- Large document loading is represented as range-based block loading.

## Architecture overview

### Frontend (`frontend/`)

- React + TypeScript single-page UI.
- WebSocket client sends protocol messages (`join_document`, `load_range`, `edit_block`, `presence_update`, `heartbeat`, `request_resync`).
- Local reducer tracks loaded block ranges, sequencing metadata, collaborator presence, and recent events.
- Demo shell lets you switch between:
  - `doc-small` (quick collaboration smoke test)
  - `doc-large` (range loading behavior)

### Backend (`backend/`)

- Node + TypeScript WebSocket server (`/ws`) and simple HTTP endpoints (`/health` + optional debug routes).
- `DocumentSessionManager` owns session lifecycle, message handling, broadcast fanout, and sequencing metadata responses.
- In-memory stores for documents, blocks, operation log, and snapshots.
- Services:
  - `OperationService` validates base block version and applies accepted edits.
  - `PresenceService` tracks session presence + heartbeat expiry.
  - `SnapshotService` creates periodic point-in-time snapshots.
  - `RecoveryService` reconstructs state from snapshot + operation log tail.

## Why block segmentation was chosen

Blocks are independently addressable units (`blockId`, `orderKey`, `version`). This keeps the model simple and avoids broadcasting/replacing the full document for every edit. It also gives a natural anchor for:

- scoped conflicts (per block)
- presence (active block / cursor block)
- range-based loading for large docs

## Why the server is authoritative

The server is the source of truth for acceptance and ordering:

- it validates `baseBlockVersion`
- rejects stale or invalid edits
- assigns monotonically increasing sequence numbers
- appends accepted operations to the operation log
- broadcasts canonical `block_updated` state

This keeps clients simple and avoids diverging local histories.

## How conflicts are handled

Conflict handling is intentionally simple for prototype clarity:

- An edit is accepted only when `baseBlockVersion` equals the current authoritative block version.
- If the base version is stale (or ahead), the server rejects with `edit_rejected` including authoritative block text/version.
- Server also sends `resync_required` so the client can rejoin/reload and continue.

Result: same-block concurrent edits do **not** degrade into naive full-document overwrite; conflicts are constrained to the targeted block and resolved by reject/resync.

## How presence is modeled

Presence is a document-scoped session map keyed by `clientId` with:

- `displayName`
- `activeBlockId`
- optional cursor info (`blockId`, `offset`)
- `lastHeartbeatAt`

The server emits:

- `presence_state` on join
- `presence_diff` for join/update/leave

Heartbeats and TTL pruning model online/offline status.

## How operation log + snapshots work

- Every accepted operation gets a server sequence number and is appended to an in-memory append-only log.
- `SnapshotService` creates snapshots every *N* operations (default interval: 20).
- Snapshots store serialized block state up to `upToSequence`.
- `RecoveryService` can reconstruct document state from latest snapshot + subsequent log entries.

This demonstrates the production pattern of log for fine-grained history + snapshots for efficient recovery.

## How large-document loading is represented

The client loads blocks by order-key ranges via `load_range` instead of fetching the entire doc. The backend enforces a max range span and returns only blocks within `[startOrderKeyInclusive, endOrderKeyExclusive)`.

This models windowed/lazy loading for large documents.

## Run locally

### 1) Start backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:3001` (WebSocket at `ws://localhost:3001/ws`).

### 2) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

### 3) Try collaboration

1. Open `http://localhost:5173` in two tabs.
2. Keep both tabs on **Quick Notes** (`doc-small`) to collaborate.
3. Edit the same and different blocks from each tab.
4. Watch collaborator presence, sequence updates, and recent events.
5. Switch to **Large Seed Document** (`doc-large`) and use range loading controls.

## Limitations (prototype)

This implementation is intentionally constrained:

- in-memory storage only (data resets on restart)
- single-process backend
- basic conflict policy (reject/resync, no advanced merge)
- plain text block payloads (`replace_block` only in current operation path)
- no authentication/authorization
- modest client UX and error handling

## Deferred production concerns

- authentication and permissions
- Redis-backed presence
- durable append-only log
- sticky session routing
- horizontal scaling
- richer merge/rebase logic
- rich text model
- comments/suggestions
- advanced observability
- failover / HA

## Final acceptance checklist

- [x] Two tabs can collaborate on the same doc.
- [x] Users can see each other online.
- [x] Block-level edits sync in near real time.
- [x] Same-block concurrent edits do not devolve into naive full-document overwrite.
- [x] Operations are sequenced and logged.
- [x] Snapshots exist conceptually and in code.
- [x] Large document handling is range-based.

