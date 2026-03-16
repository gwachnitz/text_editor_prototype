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

type UnifiedDiff = {
  start: number;
  previousEnd: number;
  nextEnd: number;
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
  const lastAnnouncedBlockIdRef = useRef<string>();

  const unifiedText = useMemo(() => blocks.map((block) => block.text).join("\n"), [blocks]);

  const getBlockStartOffset = (blockIndex: number): number => {
    let offset = 0;

    for (let index = 0; index < blockIndex; index += 1) {
      offset += blocks[index].text.length;
      offset += 1;
    }

    return offset;
  };

  const findBlockIndexAtPosition = (position: number): number => {
    if (blocks.length === 0) {
      return -1;
    }

    const clampedPosition = Math.max(0, Math.min(position, unifiedText.length));
    let cursor = 0;

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const blockEnd = cursor + block.text.length;

      if (clampedPosition <= blockEnd || index === blocks.length - 1) {
        return index;
      }

      cursor = blockEnd + 1;
    }

    return blocks.length - 1;
  };

  const findDiff = (previousText: string, nextText: string): UnifiedDiff => {
    const minLength = Math.min(previousText.length, nextText.length);
    let start = 0;

    while (start < minLength && previousText[start] === nextText[start]) {
      start += 1;
    }

    let previousEnd = previousText.length;
    let nextEnd = nextText.length;

    while (
      previousEnd > start &&
      nextEnd > start &&
      previousText[previousEnd - 1] === nextText[nextEnd - 1]
    ) {
      previousEnd -= 1;
      nextEnd -= 1;
    }

    return { start, previousEnd, nextEnd };
  };

  const emitUnifiedEdit = (
    nextText: string,
    emitChange: (block: Block, text: string) => void
  ): void => {
    if (nextText === unifiedText || blocks.length === 0) {
      return;
    }

    const diff = findDiff(unifiedText, nextText);
    const blockIndex = findBlockIndexAtPosition(diff.start);
    if (blockIndex < 0) {
      return;
    }

    const block = blocks[blockIndex];
    const blockStart = getBlockStartOffset(blockIndex);

    const localStart = Math.max(0, Math.min(diff.start - blockStart, block.text.length));
    const localPreviousEnd = Math.max(
      localStart,
      Math.min(diff.previousEnd - blockStart, block.text.length)
    );
    const replacement = nextText.slice(diff.start, diff.nextEnd);
    const nextBlockText =
      block.text.slice(0, localStart) + replacement + block.text.slice(localPreviousEnd);

    if (nextBlockText !== block.text) {
      emitChange(block, nextBlockText);
    }
  };

  const updateActiveBlock = (position: number): void => {
    const blockIndex = findBlockIndexAtPosition(position);
    const nextBlockId = blockIndex >= 0 ? blocks[blockIndex]?.id : undefined;

    if (lastAnnouncedBlockIdRef.current === nextBlockId) {
      return;
    }

    lastAnnouncedBlockIdRef.current = nextBlockId;
    onActiveBlockChange(nextBlockId);
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
                onFocus={(event) => updateActiveBlock(event.currentTarget.selectionStart ?? 0)}
                onClick={(event) => updateActiveBlock(event.currentTarget.selectionStart ?? 0)}
                onKeyUp={(event) => updateActiveBlock(event.currentTarget.selectionStart ?? 0)}
                onBlur={(event) => {
                  lastAnnouncedBlockIdRef.current = undefined;
                  onActiveBlockChange(undefined);
                  emitUnifiedEdit(event.currentTarget.value, onBlockCommit);
                }}
                onChange={(event) => emitUnifiedEdit(event.target.value, onBlockChange)}
                onScroll={(event) => {
                  const target = event.currentTarget;
                  const nearTop = target.scrollTop <= 80;
                  const nearBottom =
                    target.scrollHeight - (target.scrollTop + target.clientHeight) <= 80;

                  if (nearTop && !wasNearTopRef.current) {
                    onBlocksScrollBoundary("up");
                  }

                  if (nearBottom && !wasNearBottomRef.current) {
                    onBlocksScrollBoundary("down");
                  }

                  wasNearTopRef.current = nearTop;
                  wasNearBottomRef.current = nearBottom;
                }}
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
