import { useEffect } from "react";
import { EditorLayout } from "../components/EditorLayout";
import { RealtimeClient } from "../realtime/websocketClient";

type Props = {
  documentId: string;
};

export function DocumentPage({ documentId }: Props): JSX.Element {
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/ws";
    const client = new RealtimeClient(wsUrl);
    const clientId = crypto.randomUUID();
    client.connect();
    client.joinDocument({ documentId, clientId });

    return () => {
      client.disconnect();
    };
  }, [documentId]);

  return <EditorLayout documentId={documentId} />;
}
