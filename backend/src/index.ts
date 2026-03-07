import { createServer } from "node:http";
import { createWebSocketServer } from "./server/websocketServer.js";
import { DocumentSessionManager } from "./services/documentSessionManager.js";
import { OperationService } from "./services/operationService.js";
import { PresenceService } from "./services/presenceService.js";
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
const presenceService = new PresenceService();

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
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

createWebSocketServer(httpServer, sessionManager);

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
