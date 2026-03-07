import { createServer } from "node:http";
import { createWebSocketServer } from "./server/websocketServer.js";
import { DocumentSessionManager } from "./services/documentSessionManager.js";
import { OperationService } from "./services/operationService.js";
import { PresenceService } from "./services/presenceService.js";
import { RecoveryService } from "./services/recoveryService.js";
import { SnapshotService } from "./services/snapshotService.js";
import { seedDemoData } from "./seed/seedDemoData.js";
import { BlockStore } from "./stores/blockStore.js";
import { DocumentStore } from "./stores/documentStore.js";
import { OperationLogStore } from "./stores/operationLogStore.js";

const port = Number(process.env.PORT ?? 3001);

const documentStore = new DocumentStore();
const blockStore = new BlockStore();
const operationLogStore = new OperationLogStore();
const operationService = new OperationService(blockStore, operationLogStore, documentStore);
const snapshotService = new SnapshotService(blockStore, documentStore);
const recoveryService = new RecoveryService(operationLogStore, snapshotService);
const presenceService = new PresenceService();
const debugEndpointsEnabled = process.env.ENABLE_DEBUG_ENDPOINTS === "true";

seedDemoData(documentStore, blockStore);

const sessionManager = new DocumentSessionManager({
  blockStore,
  documentStore,
  operationLogStore,
  operationService,
  snapshotService,
  presenceService
});

const httpServer = createServer((req, res) => {
  const reqMeta = req as { url?: string; method?: string; headers?: Record<string, string | undefined> };
  const method = reqMeta.method ?? "GET";
  let url: URL;
  try {
    url = new URL(reqMeta.url ?? "/", `http://${reqMeta.headers?.host ?? "localhost"}`);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid request URL" }));
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname.startsWith("/debug/") && !debugEndpointsEnabled) {
    res.writeHead(404);
    res.end();
    return;
  }

  const operationsPath = url.pathname.match(/^\/debug\/documents\/([^/]+)\/operations$/);
  if (method === "GET" && operationsPath) {
    const documentId = decodeURIComponent(operationsPath[1]);
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.max(0, Math.floor(limitParam)) : 50;

    const operations = operationLogStore.listRecent(documentId, limit);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ documentId, count: operations.length, operations }));
    return;
  }

  const latestSnapshotPath = url.pathname.match(/^\/debug\/documents\/([^/]+)\/snapshot\/latest$/);
  if (method === "GET" && latestSnapshotPath) {
    const documentId = decodeURIComponent(latestSnapshotPath[1]);
    const snapshot = snapshotService.getLatest(documentId);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ documentId, snapshot: snapshot ?? null }));
    return;
  }

  const createSnapshotPath = url.pathname.match(/^\/debug\/documents\/([^/]+)\/snapshot$/);
  if (method === "POST" && createSnapshotPath) {
    const documentId = decodeURIComponent(createSnapshotPath[1]);
    const latestSequence = operationLogStore.getLatestSequence(documentId);
    const snapshot = snapshotService.createSnapshot(documentId, latestSequence);

    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ documentId, snapshot }));
    return;
  }

  const reconstructPath = url.pathname.match(/^\/debug\/documents\/([^/]+)\/reconstruct$/);
  if (method === "GET" && reconstructPath) {
    try {
      const documentId = decodeURIComponent(reconstructPath[1]);
      const sequenceParam = url.searchParams.get("targetSequence");
      let targetSequence: number | undefined;
      if (sequenceParam !== null) {
        const parsed = Number(sequenceParam);
        if (!Number.isFinite(parsed)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid targetSequence; must be a finite number" }));
          return;
        }
        targetSequence = Math.floor(parsed);
      }
      const result = recoveryService.reconstructDocumentState(documentId, targetSequence);

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ documentId, reconstruction: result }));
      return;
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to reconstruct document"
        })
      );
      return;
    }
  }

  res.writeHead(404);
  res.end();
});

createWebSocketServer(httpServer, sessionManager);

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
