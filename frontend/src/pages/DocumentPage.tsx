import { useEffect, useMemo, useReducer, useRef } from "react";
import { EditorLayout } from "../components/EditorLayout";
import { RealtimeClient, type ConnectionStatus } from "../realtime/websocketClient";
import type { Block, ServerToClientMessage } from "../types/protocol";
import { createInitialDocumentState, documentReducer } from "./documentState";

type Props = {
  documentId: string;
};

const HEARTBEAT_INTERVAL_MS = 5000;
const EDIT_DEBOUNCE_MS = 200;

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

export function DocumentPage({ documentId }: Props): JSX.Element {
  const identityRef = useRef<ClientIdentity>(createClientIdentity());
  const clientRef = useRef<RealtimeClient>();
  const stateRef = useRef(createInitialDocumentState(documentId));
  const pendingEditTimersRef = useRef<Record<string, number>>({});
  const [state, dispatch] = useReducer(documentReducer, documentId, createInitialDocumentState);

  stateRef.current = state;

  const blocks = useMemo(
    () => Object.values(state.blocksById).sort((a, b) => a.orderKey - b.orderKey),
    [state.blocksById]
  );

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
  }, [documentId]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/ws";

    const client = new RealtimeClient(wsUrl, {
      onMessage: (message: ServerToClientMessage) => {
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
      window.clearInterval(heartbeatInterval);
      client.disconnect();
      clientRef.current = undefined;
    };
  }, [documentId]);

  useEffect(() => {
    if (!state.initialRange || !clientRef.current) {
      return;
    }

    clientRef.current.loadRange({
      documentId,
      startOrderKeyInclusive: state.initialRange.startOrderKeyInclusive,
      endOrderKeyExclusive: state.initialRange.endOrderKeyExclusive
    });
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
      onBlockChange={handleBlockChange}
      onBlockCommit={handleBlockCommit}
      onActiveBlockChange={handleActiveBlockChange}
      onRequestResync={handleRequestResync}
    />
  );
}
