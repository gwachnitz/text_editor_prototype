import { useEffect, useMemo, useReducer, useRef } from "react";
import { EditorLayout } from "../components/EditorLayout";
import { RealtimeClient, type ConnectionStatus } from "../realtime/websocketClient";
import type { Block, ServerToClientMessage } from "../types/protocol";
import { applyServerMessage, createInitialDocumentState } from "./documentState";

type Props = {
  documentId: string;
};

const HEARTBEAT_INTERVAL_MS = 5000;

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
  const latestSequenceRef = useRef(0);
  const [state, dispatch] = useReducer(applyServerMessage, createInitialDocumentState(documentId));

  latestSequenceRef.current = state.sequencing.latestSequence;

  const blocks = useMemo(() => Object.values(state.blocksById).sort((a, b) => a.orderKey - b.orderKey), [state.blocksById]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/ws";

    const client = new RealtimeClient(wsUrl, {
      onMessage: (message: ServerToClientMessage) => {
        dispatch({ kind: "server_message", message });

        if (message.type === "resync_required") {
          client.requestResync({ documentId, sinceSequence: latestSequenceRef.current });
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
    if (!clientRef.current) {
      return;
    }

    clientRef.current.editBlock({
      documentId,
      operation: {
        id: createOperationId(),
        blockId: block.id,
        baseBlockVersion: block.version,
        payload: {
          type: "replace_block",
          text
        }
      }
    });
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
      onActiveBlockChange={handleActiveBlockChange}
    />
  );
}
