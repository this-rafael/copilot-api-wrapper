import { EventEmitter } from 'events';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

export type JsonRpcId = number | string;

interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcRequestMessage {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotificationMessage {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponseMessage {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorShape;
}

type JsonRpcMessage = JsonRpcRequestMessage | JsonRpcNotificationMessage | JsonRpcResponseMessage;

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface JsonRpcRequestEvent {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotificationEvent {
  method: string;
  params?: unknown;
}

interface JsonRpcProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

const HEADER_DELIMITER = Buffer.from('\r\n\r\n');

export class JsonRpcProcess extends EventEmitter {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private readonly stdoutChunks: Buffer[] = [];
  private nextRequestId = 1;
  private closed = false;

  constructor(options: JsonRpcProcessOptions) {
    super();

    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'pipe',
    });

    this.child.stdout.on('data', (chunk: Buffer) => {
      this.stdoutChunks.push(chunk);
      this.drainStdout();
    });

    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      this.emit('stderr', chunk);
    });

    this.child.on('error', (error) => {
      this.failPendingRequests(error);
      this.emit('error', error);
    });

    this.child.on('exit', (code, signal) => {
      this.closed = true;
      this.failPendingRequests(new Error(`JSON-RPC process exited (${code ?? 'null'}${signal ? ` / ${signal}` : ''})`));
      this.emit('exit', code, signal ?? undefined);
    });
  }

  request(method: string, params?: unknown): { id: JsonRpcId; promise: Promise<unknown> } {
    const id = this.nextRequestId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { method, resolve, reject });
      try {
        this.write({
          jsonrpc: '2.0',
          id,
          method,
          params,
        });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error as Error);
      }
    });

    return { id, promise };
  }

  notify(method: string, params?: unknown): void {
    this.write({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.write({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  respondError(id: JsonRpcId, error: JsonRpcErrorShape): void {
    this.write({
      jsonrpc: '2.0',
      id,
      error,
    });
  }

  cancel(id: JsonRpcId): void {
    this.notify('$/cancelRequest', { id });
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.child.kill(signal);
  }

  private write(message: JsonRpcMessage): void {
    if (this.closed) {
      throw new Error('Cannot write to a closed JSON-RPC process');
    }

    const payload = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
    this.child.stdin.write(header, 'utf8');
    this.child.stdin.write(payload, 'utf8');
  }

  private drainStdout(): void {
    let buffer = Buffer.concat(this.stdoutChunks);

    while (true) {
      const headerEnd = buffer.indexOf(HEADER_DELIMITER);
      if (headerEnd === -1) {
        break;
      }

      const headerText = buffer.subarray(0, headerEnd).toString('utf8');
      const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!contentLengthMatch) {
        buffer = buffer.subarray(headerEnd + HEADER_DELIMITER.length);
        this.emit('protocolError', new Error(`Missing Content-Length header: ${headerText}`));
        continue;
      }

      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = headerEnd + HEADER_DELIMITER.length;
      const messageEnd = messageStart + contentLength;

      if (buffer.length < messageEnd) {
        break;
      }

      const payload = buffer.subarray(messageStart, messageEnd).toString('utf8');
      buffer = buffer.subarray(messageEnd);

      try {
        const message = JSON.parse(payload) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (error) {
        this.emit('protocolError', error);
      }
    }

    this.stdoutChunks.length = 0;
    if (buffer.length > 0) {
      this.stdoutChunks.push(buffer);
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ('method' in message && 'id' in message) {
      const event: JsonRpcRequestEvent = {
        id: message.id,
        method: message.method,
        params: message.params,
      };
      this.emit('request', event);
      return;
    }

    if ('method' in message) {
      const event: JsonRpcNotificationEvent = {
        method: message.method,
        params: message.params,
      };
      this.emit('notification', event);
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      return;
    }

    pending.resolve(message.result);
  }

  private failPendingRequests(error: Error): void {
    for (const [requestId, pending] of this.pendingRequests) {
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }
}
