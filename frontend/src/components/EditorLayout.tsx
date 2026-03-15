import { useMemo, useRef, type UIEvent } from "react";
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

  const unifiedText = useMemo(() => blocks.map((block) => block.text).join("\n"), [blocks]);

  const mapTextToBlockTexts = (text: string): string[] => {
    if (blocks.length === 0) {
      return [];
    }

    const lines = text.split("\n");
    const fixedBlocks = Math.max(0, blocks.length - 1);
    const headLines = lines.slice(0, fixedBlocks);

    while (headLines.length < fixedBlocks) {
      headLines.push("");
    }

    const tailText = lines.slice(fixedBlocks).join("\n");
    return [...headLines, tailText];
  };

  const findBlockAtPosition = (position: number, text: string): Block | undefined => {
    if (blocks.length === 0) {
      return undefined;
    }

    const clampedPosition = Math.max(0, Math.min(position, text.length));
    const separatorsToFind = Math.max(0, blocks.length - 1);
    const separatorIndices: number[] = [];

    for (let index = 0; index < text.length && separatorIndices.length < separatorsToFind; index += 1) {
      if (text[index] === "\n") {
        separatorIndices.push(index);
      }
    }

    for (let blockIndex = 0; blockIndex < separatorIndices.length; blockIndex += 1) {
      if (clampedPosition <= separatorIndices[blockIndex]) {
        return blocks[blockIndex];
      }
    }

    return blocks[blocks.length - 1];
  };

  const applyUnifiedTextChange = (nextText: string): void => {
    const nextBlockTexts = mapTextToBlockTexts(nextText);

    blocks.forEach((block, index) => {
      const nextBlockText = nextBlockTexts[index] ?? "";
      if (nextBlockText !== block.text) {
        onBlockChange(block, nextBlockText);
      }
    });
  };

  const commitUnifiedText = (nextText: string): void => {
    const nextBlockTexts = mapTextToBlockTexts(nextText);

    blocks.forEach((block, index) => {
      const nextBlockText = nextBlockTexts[index] ?? "";
      if (nextBlockText !== block.text) {
        onBlockCommit(block, nextBlockText);
      }
    });
  };

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
          <h2>Editor</h2>
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
            {blocks.length > 0 && (
              <textarea
                className="editor-textarea unified-editor-textarea"
                value={unifiedText}
                onFocus={(event) => {
                  const activeBlock = findBlockAtPosition(event.currentTarget.selectionStart ?? 0, event.currentTarget.value);
                  onActiveBlockChange(activeBlock?.id);
                }}
                onClick={(event) => {
                  const activeBlock = findBlockAtPosition(event.currentTarget.selectionStart ?? 0, event.currentTarget.value);
                  onActiveBlockChange(activeBlock?.id);
                }}
                onKeyUp={(event) => {
                  const activeBlock = findBlockAtPosition(event.currentTarget.selectionStart ?? 0, event.currentTarget.value);
                  onActiveBlockChange(activeBlock?.id);
                }}
                onBlur={(event) => {
                  onActiveBlockChange(undefined);
                  commitUnifiedText(event.currentTarget.value);
                }}
                onChange={(event) => applyUnifiedTextChange(event.target.value)}
              />
            )}
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
