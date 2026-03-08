import { useEffect, useMemo, useReducer, useRef } from "react";
import { EditorLayout } from "../components/EditorLayout";
import { RealtimeClient, type ConnectionStatus } from "../realtime/websocketClient";
import type { Block, ServerToClientMessage } from "../types/protocol";
import { createInitialDocumentState, documentReducer, isRangeLoaded } from "./documentState";

type Props = {
  documentId: string;
};

const HEARTBEAT_INTERVAL_MS = 5000;
const EDIT_DEBOUNCE_MS = 200;
const RANGE_WINDOW = 20;
const NEARBY_BUFFER = 10;

type ClientIdentity = {
  clientId: string;
  displayName: string;
};

function createClientIdentity(): ClientIdentity {
  const seed = Math.random().toString(36).slice(2, 8);
  return {
    clientId: crypto.randomUUID(),
    displayName: `User-${seed}`
  };
}

function createOperationId(): string {
  return crypto.randomUUID();
}

function toRangeKey(startOrderKeyInclusive: number, endOrderKeyExclusive: number): string {
  return `${startOrderKeyInclusive}:${endOrderKeyExclusive}`;
}

export function DocumentPage({ documentId }: Props): JSX.Element {
  const identityRef = useRef<ClientIdentity>(createClientIdentity());
  const clientRef = useRef<RealtimeClient>();
  const stateRef = useRef(createInitialDocumentState(documentId));
  const pendingEditTimersRef = useRef<Record<string, number>>({});
  const pendingRangeRequestsRef = useRef(new Set<string>());
  const [state, dispatch] = useReducer(documentReducer, documentId, createInitialDocumentState);

  stateRef.current = state;

  const blocks = useMemo(
    () => Object.values(state.blocksById).sort((a, b) => a.orderKey - b.orderKey),
    [state.blocksById]
  );

  const firstLoadedOrder = blocks[0]?.orderKey;
  const lastLoadedOrder = blocks[blocks.length - 1]?.orderKey;

  const requestRange = (startOrderKeyInclusive: number, endOrderKeyExclusive: number): void => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const clampedStart = Math.max(0, startOrderKeyInclusive);
    const clampedEnd = Math.max(clampedStart, Math.min(endOrderKeyExclusive, stateRef.current.totalBlocks));

    if (clampedEnd <= clampedStart) {
      return;
    }

    if (isRangeLoaded(stateRef.current.loadedRanges, clampedStart, clampedEnd)) {
      return;
    }

    const rangeKey = toRangeKey(clampedStart, clampedEnd);
    if (pendingRangeRequestsRef.current.has(rangeKey)) {
      return;
    }

    pendingRangeRequestsRef.current.add(rangeKey);
    client.loadRange({
      documentId,
      startOrderKeyInclusive: clampedStart,
      endOrderKeyExclusive: clampedEnd
    });
  };

  const requestAdjacentRange = (direction: "up" | "down"): void => {
    if (stateRef.current.totalBlocks === 0) {
      return;
    }

    if (typeof firstLoadedOrder !== "number" || typeof lastLoadedOrder !== "number") {
      return;
    }

    if (direction === "up") {
      requestRange(firstLoadedOrder - RANGE_WINDOW, firstLoadedOrder);
      return;
    }

    requestRange(lastLoadedOrder + 1, lastLoadedOrder + 1 + RANGE_WINDOW);
  };

  const sendEdit = (blockId: string, text: string): void => {
    const client = clientRef.current;
    const currentBlock = stateRef.current.blocksById[blockId];

    if (!client || !currentBlock) {
      return;
    }

    client.editBlock({
      documentId,
      operation: {
        id: createOperationId(),
        blockId,
        baseBlockVersion: currentBlock.version,
        payload: {
          type: "replace_block",
          text
        }
      }
    });
  };

  useEffect(() => {
    dispatch({ kind: "reset_document", documentId });
    pendingRangeRequestsRef.current.clear();
  }, [documentId]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/ws";

    const client = new RealtimeClient(wsUrl, {
      onMessage: (message: ServerToClientMessage) => {
        if (message.type === "range_data") {
          const key = toRangeKey(message.startOrderKeyInclusive, message.endOrderKeyExclusive);
          pendingRangeRequestsRef.current.delete(key);
        }

        if (message.type === "error" || message.type === "resync_required") {
          pendingRangeRequestsRef.current.clear();
        }

        dispatch({ kind: "server_message", message });

        if (message.type === "resync_required") {
          dispatch({ kind: "reset_document", documentId });
          client.joinDocument({
            documentId,
            clientId: identityRef.current.clientId,
            displayName: identityRef.current.displayName
          });
        }
      },
      onStatusChange: (status: ConnectionStatus) => {
        dispatch({ kind: "connection_status", status });
      }
    });

    clientRef.current = client;
    client.connect();

    client.joinDocument({
      documentId,
      clientId: identityRef.current.clientId,
      displayName: identityRef.current.displayName
    });

    const heartbeatInterval = window.setInterval(() => {
      client.heartbeat({ documentId, clientId: identityRef.current.clientId });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      for (const timer of Object.values(pendingEditTimersRef.current)) {
        window.clearTimeout(timer);
      }
      pendingEditTimersRef.current = {};
      pendingRangeRequestsRef.current.clear();
      window.clearInterval(heartbeatInterval);
      client.disconnect();
      clientRef.current = undefined;
    };
  }, [documentId]);

  useEffect(() => {
    if (!state.initialRange || !clientRef.current) {
      return;
    }

    requestRange(
      state.initialRange.startOrderKeyInclusive,
      state.initialRange.endOrderKeyExclusive
    );
  }, [documentId, state.initialRange]);

  const handleBlockChange = (block: Block, text: string): void => {
    dispatch({ kind: "optimistic_block_text", blockId: block.id, text });

    const existingTimer = pendingEditTimersRef.current[block.id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    pendingEditTimersRef.current[block.id] = window.setTimeout(() => {
      sendEdit(block.id, text);
      delete pendingEditTimersRef.current[block.id];
    }, EDIT_DEBOUNCE_MS);
  };

  const handleBlockCommit = (block: Block, text: string): void => {
    const existingTimer = pendingEditTimersRef.current[block.id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete pendingEditTimersRef.current[block.id];
    }

    sendEdit(block.id, text);
  };

  const handleActiveBlockChange = (blockId?: string): void => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const activeBlock = blockId ? stateRef.current.blocksById[blockId] : undefined;
    if (activeBlock) {
      requestRange(
        activeBlock.orderKey - NEARBY_BUFFER,
        activeBlock.orderKey + NEARBY_BUFFER + 1
      );
    }

    client.updatePresence({
      documentId,
      clientId: identityRef.current.clientId,
      presence: {
        displayName: identityRef.current.displayName,
        activeBlockId: blockId,
        cursorBlockId: blockId
      }
    });
  };

  const handleRequestResync = (): void => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    client.requestResync({
      documentId,
      sinceSequence: state.sequencing.latestSequence
    });
  };

  return (
    <EditorLayout
      documentId={documentId}
      documentTitle={state.documentTitle}
      connectionStatus={state.connectionStatus}
      clientId={identityRef.current.clientId}
      collaborators={state.presence}
      blocks={blocks}
      sequencing={state.sequencing}
      recentEvents={state.recentEvents}
      loadedBlockCount={blocks.length}
      totalBlocks={state.totalBlocks}
      canLoadPrevious={typeof firstLoadedOrder === "number" && firstLoadedOrder > 0}
      canLoadNext={
        typeof lastLoadedOrder === "number" &&
        lastLoadedOrder < Math.max(0, state.totalBlocks - 1)
      }
      onLoadPrevious={() => requestAdjacentRange("up")}
      onLoadNext={() => requestAdjacentRange("down")}
      onBlocksScrollBoundary={(direction) => requestAdjacentRange(direction)}
      onBlockChange={handleBlockChange}
      onBlockCommit={handleBlockCommit}
      onActiveBlockChange={handleActiveBlockChange}
      onRequestResync={handleRequestResync}
    />
  );
}
