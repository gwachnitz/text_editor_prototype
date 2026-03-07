type Props = {
  documentId: string;
};

export function EditorLayout({ documentId }: Props): JSX.Element {
  return (
    <main className="editor-shell">
      <header className="editor-header">
        <h1>Realtime Doc Editor (Prototype)</h1>
        <p>Document: {documentId}</p>
      </header>

      <section className="editor-body">
        <aside className="panel">
          <h2>Presence</h2>
          <p>Presence list will appear here.</p>
        </aside>

        <section className="panel">
          <h2>Blocks</h2>
          <p>Block-segmented editor surface scaffold.</p>
          <textarea
            className="editor-textarea"
            defaultValue="This is a placeholder editor area."
          />
        </section>

        <aside className="panel">
          <h2>Ops / Snapshot</h2>
          <p>Operation log + snapshot indicators will appear here.</p>
        </aside>
      </section>
    </main>
  );
}
