import { useEffect } from "react";
import { EditorLayout } from "../components/EditorLayout";
import { RealtimeClient } from "../realtime/websocketClient";

type Props = {
  documentId: string;
};

export function DocumentPage({ documentId }: Props): JSX.Element {
  useEffect(() => {
    const client = new RealtimeClient("ws://localhost:3001/ws");
    client.connect();
    client.joinDocument({ documentId, clientId: "local-dev-client" });

    return () => {
      client.disconnect();
    };
  }, [documentId]);

  return <EditorLayout documentId={documentId} />;
}
