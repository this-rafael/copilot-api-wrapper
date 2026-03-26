#!/usr/bin/env node

type JsonRpcId = number | string;

interface InlineCompletionRequest {
  textDocument: {
    uri: string;
    version: number;
  };
  position: {
    line: number;
    character: number;
  };
}

let documentText = '';
let lastCompletionLabel = '';

function writeMessage(message: unknown): void {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
}

function respond(id: JsonRpcId, result: unknown): void {
  writeMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function notify(method: string, params?: unknown): void {
  writeMessage({
    jsonrpc: '2.0',
    method,
    params,
  });
}

function buildSuggestion(text: string) {
  if (text.endsWith('hello')) {
    lastCompletionLabel = 'accept:hello-world';
    return {
      insertText: ' world',
      command: {
        command: 'github.copilot.didAcceptCompletionItem',
        arguments: [lastCompletionLabel],
      },
    };
  }

  if (text.endsWith('console.')) {
    lastCompletionLabel = 'accept:console-log';
    return {
      insertText: 'log()',
      command: {
        command: 'github.copilot.didAcceptCompletionItem',
        arguments: [lastCompletionLabel],
      },
    };
  }

  lastCompletionLabel = '';
  return null;
}

function handleMessage(message: any): void {
  if (message.method === 'initialize') {
    respond(message.id, {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 2,
        },
      },
    });
    return;
  }

  if (message.method === 'initialized') {
    notify('didChangeStatus', {
      kind: 'Normal',
      message: 'Autocomplete fake pronto',
    });
    return;
  }

  if (message.method === 'workspace/didChangeConfiguration' || message.method === '$/cancelRequest') {
    return;
  }

  if (message.method === 'textDocument/didOpen') {
    documentText = message.params?.textDocument?.text ?? '';
    return;
  }

  if (message.method === 'textDocument/didChange') {
    documentText = message.params?.contentChanges?.[0]?.text ?? documentText;
    return;
  }

  if (message.method === 'textDocument/didClose') {
    documentText = '';
    return;
  }

  if (message.method === 'textDocument/didFocus' || message.method === 'textDocument/didShowCompletion') {
    return;
  }

  if (message.method === 'textDocument/inlineCompletion') {
    const params = message.params as InlineCompletionRequest;
    const suggestion = buildSuggestion(documentText);
    if (!suggestion) {
      respond(message.id, { items: [] });
      return;
    }

    respond(message.id, {
      items: [
        {
          insertText: suggestion.insertText,
          range: {
            start: params.position,
            end: params.position,
          },
          command: suggestion.command,
        },
      ],
    });
    return;
  }

  if (message.method === 'workspace/executeCommand') {
    notify('didChangeStatus', {
      kind: 'Normal',
      message: `Sugestao aceita: ${message.params?.arguments?.[0] ?? lastCompletionLabel}`,
    });
    respond(message.id, null);
    return;
  }

  if (message.id !== undefined) {
    respond(message.id, null);
  }
}

let buffer = Buffer.alloc(0);
const delimiter = Buffer.from('\r\n\r\n');

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf(delimiter);
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.subarray(0, headerEnd).toString('utf8');
    const match = /Content-Length:\s*(\d+)/i.exec(headerText);
    if (!match) {
      buffer = buffer.subarray(headerEnd + delimiter.length);
      continue;
    }

    const contentLength = Number(match[1]);
    const bodyStart = headerEnd + delimiter.length;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) {
      return;
    }

    const body = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.subarray(bodyEnd);
    handleMessage(JSON.parse(body));
  }
});
