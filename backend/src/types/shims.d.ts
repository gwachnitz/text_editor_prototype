declare module "node:http" {
  export type Server = {
    listen: (...args: unknown[]) => void;
  };

  export function createServer(
    handler: (req: { url?: string }, res: { writeHead: (statusCode: number, headers?: Record<string, string>) => void; end: (body?: string) => void }) => void
  ): Server;
}

declare module "node:test" {
  export default function test(name: string, fn: () => void): void;
}

declare module "node:assert/strict" {
  const assert: {
    equal: (actual: unknown, expected: unknown) => void;
    deepEqual: (actual: unknown, expected: unknown) => void;
    ok: (value: unknown) => void;
  };
  export default assert;
}

declare module "ws" {
  export class WebSocketServer {
    constructor(options: { server: unknown; path?: string });
    on(event: "connection", handler: (socket: WebSocket) => void): void;
  }

  export class WebSocket {
    on(event: "message", handler: (raw: { toString: () => string }) => void): void;
    on(event: "close", handler: () => void): void;
    send(data: string): void;
  }
}

declare const process: {
  env: Record<string, string | undefined>;
};
