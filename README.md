# Simplified Collaborative Document Editor (Prototype Scaffold)

This repository is a **phase-1 scaffold** for a simplified real-time collaborative document editor.

It is intentionally optimized for:

- architectural clarity
- fast local iteration
- demoability

It intentionally does **not** yet implement full collaboration behavior.

## Project structure

```text
frontend/   # React + TypeScript app shell and editor page scaffold
backend/    # Node.js + TypeScript WebSocket server scaffold + services/stores
```

## Architecture intent (high-level)

The scaffold is prepared for the following future design:

- **Block-segmented documents** (document represented as independently addressable blocks)
- **Authoritative server-side sequencing** (server assigns sequence IDs to accepted operations)
- **WebSocket realtime sync** (client/server protocol messages)
- **Lightweight presence** (join/leave + cursors/selection stubs)
- **Operation log + snapshots** (append-only ops with periodic materialized snapshots)
- **Lazy loading for large docs** (block/window-oriented fetch API shape)

### What is deferred in this phase

- Real conflict resolution semantics (CRDT/OT sophistication)
- Persistence hardening / migrations
- Security/authentication
- Production scaling concerns
- Full rich-text model

## Quick start

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Backend starts an HTTP server with a WebSocket endpoint and a `/health` route.

### 2) Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL (typically `http://localhost:5173`).

## NPM scripts

### backend

- `npm run dev` — run backend with `tsx` watch mode
- `npm run build` — typecheck + compile TypeScript
- `npm run start` — run compiled backend from `dist`

### frontend

- `npm run dev` — run Vite dev server
- `npm run build` — typecheck + Vite production build
- `npm run preview` — preview built frontend

