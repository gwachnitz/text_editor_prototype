import { useState } from "react";
import { DocumentPage } from "../pages/DocumentPage";

type DemoDocument = {
  id: string;
  label: string;
};

const DEMO_DOCUMENTS: DemoDocument[] = [
  { id: "doc-small", label: "Quick Notes" },
  { id: "doc-large", label: "Large Seed Document" }
];

export function AppShell(): JSX.Element {
  const [activeDocumentId, setActiveDocumentId] = useState<string>(DEMO_DOCUMENTS[0].id);

  return (
    <>
      <nav className="doc-switcher">
        {DEMO_DOCUMENTS.map((document) => (
          <button
            key={document.id}
            type="button"
            className={document.id === activeDocumentId ? "active" : ""}
            onClick={() => setActiveDocumentId(document.id)}
          >
            {document.label}
          </button>
        ))}
      </nav>
      <DocumentPage documentId={activeDocumentId} />
    </>
  );
}
