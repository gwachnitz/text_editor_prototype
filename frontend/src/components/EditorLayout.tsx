import { useRef, type UIEvent } from "react";
import type { Block, PresenceSession, SequencingMetadata } from "../types/protocol";
import type { ConnectionStatus } from "../realtime/websocketClient";

type Props = {
  documentId: string;
  documentTitle: string;
  connectionStatus: ConnectionStatus;
  clientId: string;
  collaborators: PresenceSession[];
  blocks: Block[];
  sequencing: SequencingMetadata;
  recentEvents: string[];
  loadedBlockCount: number;
  totalBlocks: number;
  canLoadPrevious: boolean;
  canLoadNext: boolean;
  onLoadPrevious: () => void;
  onLoadNext: () => void;
  onBlocksScrollBoundary: (direction: "up" | "down") => void;
  onBlockChange: (block: Block, text: string) => void;
  onBlockCommit: (block: Block, text: string) => void;
  onActiveBlockChange: (blockId?: string) => void;
  onRequestResync: () => void;
};

export function EditorLayout({
  documentId,
  documentTitle,
  connectionStatus,
  clientId,
  collaborators,
  blocks,
  sequencing,
  recentEvents,
  loadedBlockCount,
  totalBlocks,
  canLoadPrevious,
  canLoadNext,
  onLoadPrevious,
  onLoadNext,
  onBlocksScrollBoundary,
  onBlockChange,
  onBlockCommit,
  onActiveBlockChange,
  onRequestResync
}: Props): JSX.Element {
  const wasNearTopRef = useRef(false);
  const wasNearBottomRef = useRef(false);

  const handleBlocksScroll = (event: UIEvent<HTMLDivElement>): void => {
    const target = event.currentTarget;
    const nearTop = target.scrollTop <= 80;
    const nearBottom = target.scrollHeight - (target.scrollTop + target.clientHeight) <= 80;

    if (nearTop && !wasNearTopRef.current) {
      onBlocksScrollBoundary("up");
    }

    if (nearBottom && !wasNearBottomRef.current) {
      onBlocksScrollBoundary("down");
    }

    wasNearTopRef.current = nearTop;
    wasNearBottomRef.current = nearBottom;
  };

  return (
    <main className="editor-shell">
      <header className="editor-header panel">
        <h1>Realtime Doc Editor (Prototype)</h1>
        <p>
          <strong>{documentTitle}</strong> ({documentId})
        </p>
        <p>
          Connection: <span className={`connection-pill ${connectionStatus}`}>{connectionStatus}</span>
        </p>
      </header>

      <section className="editor-body">
        <aside className="panel">
          <h2>Collaborators</h2>
          <ul className="simple-list">
            {collaborators.length === 0 && <li>No active collaborators yet.</li>}
            {collaborators.map((session) => (
              <li key={session.clientId}>
                <strong>{session.displayName}</strong>
                <div className="meta-row">
                  id: {session.clientId === clientId ? `${session.clientId} (you)` : session.clientId}
                </div>
                <div className="meta-row">active block: {session.activeBlockId ?? "—"}</div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel">
          <h2>Blocks</h2>
          <p className="meta-row">
            Loaded {loadedBlockCount} / {totalBlocks} blocks
          </p>
          <div className="block-controls">
            <button type="button" onClick={onLoadPrevious} disabled={!canLoadPrevious}>
              Load previous range
            </button>
            <button type="button" onClick={onLoadNext} disabled={!canLoadNext}>
              Load next range
            </button>
          </div>
          <div className="blocks" onScroll={handleBlocksScroll}>
            {blocks.length === 0 && <p>Waiting for block data…</p>}
            {blocks.map((block) => (
              <label className="block-item" key={block.id}>
                <span className="meta-row">
                  {block.id} • order:{block.orderKey} • version:{block.version}
                </span>
                <textarea
                  className="editor-textarea"
                  value={block.text}
                  onFocus={() => onActiveBlockChange(block.id)}
                  onBlur={(event) => {
                    onActiveBlockChange(undefined);
                    onBlockCommit(block, event.currentTarget.value);
                  }}
                  onChange={(event) => onBlockChange(block, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        <aside className="panel">
          <h2>Debug</h2>
          <p>sequence: {sequencing.latestSequence}</p>
          <p>snapshot version: {sequencing.latestSnapshotVersion}</p>
          <button type="button" onClick={onRequestResync}>
            Request resync
          </button>
          <h3>Recent events</h3>
          <ul className="simple-list">
            {recentEvents.length === 0 && <li>No events yet.</li>}
            {recentEvents.map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
