import type {
  Block,
  PresenceSession,
  SequencingMetadata,
  ServerToClientMessage
} from "../types/protocol";
import type { ConnectionStatus } from "../realtime/websocketClient";

const MAX_RECENT_EVENTS = 12;

export type DocumentState = {
  documentId: string;
  documentTitle: string;
  connectionStatus: ConnectionStatus;
  blocksById: Record<string, Block>;
  presence: PresenceSession[];
  sequencing: SequencingMetadata;
  initialRange?: {
    startOrderKeyInclusive: number;
    endOrderKeyExclusive: number;
  };
  recentEvents: string[];
};

export type DocumentAction =
  | { kind: "server_message"; message: ServerToClientMessage }
  | { kind: "connection_status"; status: ConnectionStatus };

export function createInitialDocumentState(documentId: string): DocumentState {
  return {
    documentId,
    documentTitle: "Loading…",
    connectionStatus: "connecting",
    blocksById: {},
    presence: [],
    sequencing: { latestSequence: 0, latestSnapshotVersion: 0 },
    recentEvents: []
  };
}

function recordEvent(state: DocumentState, label: string): string[] {
  const events = [`${new Date().toLocaleTimeString()} ${label}`, ...state.recentEvents];
  return events.slice(0, MAX_RECENT_EVENTS);
}

export function applyServerMessage(state: DocumentState, action: DocumentAction): DocumentState {
  if (action.kind === "connection_status") {
    return {
      ...state,
      connectionStatus: action.status,
      recentEvents: recordEvent(state, `connection:${action.status}`)
    };
  }

  const message = action.message;

  switch (message.type) {
    case "document_joined": {
      return {
        ...state,
        documentTitle: message.document.title,
        initialRange: message.initialRange,
        presence: message.presenceState,
        sequencing: message.sequencing,
        recentEvents: recordEvent(state, "document_joined")
      };
    }
    case "range_data": {
      const blocksById = { ...state.blocksById };
      for (const block of message.blocks) {
        blocksById[block.id] = block;
      }
      return {
        ...state,
        blocksById,
        recentEvents: recordEvent(state, `range_data:${message.blocks.length}`)
      };
    }
    case "block_updated": {
      return {
        ...state,
        blocksById: {
          ...state.blocksById,
          [message.block.id]: message.block
        },
        sequencing: {
          ...state.sequencing,
          latestSequence: Math.max(state.sequencing.latestSequence, message.sequence)
        },
        recentEvents: recordEvent(state, `block_updated:${message.block.id}`)
      };
    }
    case "presence_state": {
      return {
        ...state,
        presence: message.sessions,
        recentEvents: recordEvent(state, `presence_state:${message.sessions.length}`)
      };
    }
    case "presence_diff": {
      if (message.change === "left") {
        return {
          ...state,
          presence: state.presence.filter((session) => session.clientId !== message.clientId),
          recentEvents: recordEvent(state, `presence_left:${message.clientId}`)
        };
      }

      if (!message.session) {
        return state;
      }

      const next = state.presence.filter((session) => session.clientId !== message.clientId);
      next.push(message.session);
      next.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return {
        ...state,
        presence: next,
        recentEvents: recordEvent(state, `presence_${message.change}:${message.clientId}`)
      };
    }
    case "snapshot_created": {
      return {
        ...state,
        sequencing: {
          ...state.sequencing,
          latestSnapshotVersion: Math.max(
            state.sequencing.latestSnapshotVersion,
            message.snapshot.upToSequence
          )
        },
        recentEvents: recordEvent(state, `snapshot:${message.snapshot.upToSequence}`)
      };
    }
    case "edit_accepted":
    case "edit_rebased": {
      return {
        ...state,
        sequencing: {
          ...state.sequencing,
          latestSequence: Math.max(state.sequencing.latestSequence, message.sequence)
        },
        recentEvents: recordEvent(state, `${message.type}:${message.operationId}`)
      };
    }
    case "resync_required": {
      return {
        ...state,
        sequencing: message.sequencing,
        recentEvents: recordEvent(state, `resync_required:${message.reason}`)
      };
    }
    case "edit_rejected": {
      return {
        ...state,
        recentEvents: recordEvent(state, `edit_rejected:${message.reason}`)
      };
    }
    case "error": {
      return {
        ...state,
        recentEvents: recordEvent(state, `error:${message.message}`)
      };
    }
    default:
      return state;
  }
}
