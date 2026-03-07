import { createServer } from "node:http";
import { createWebSocketServer } from "./server/websocketServer.js";
import { DocumentSessionManager } from "./services/documentSessionManager.js";
import { PresenceService } from "./services/presenceService.js";
import { SnapshotService } from "./services/snapshotService.js";
import { BlockStore } from "./stores/blockStore.js";
import { OperationLogStore } from "./stores/operationLogStore.js";

const port = Number(process.env.PORT ?? 3001);

const blockStore = new BlockStore();
const operationLogStore = new OperationLogStore();
const snapshotService = new SnapshotService(blockStore, operationLogStore);
const presenceService = new PresenceService();
const sessionManager = new DocumentSessionManager({
  blockStore,
  operationLogStore,
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
