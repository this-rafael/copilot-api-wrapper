import { describe, it, expect } from 'vitest';
import { RuleStateStore } from '../src/state.js';
import { reconcileExpired } from '../src/scheduler.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

function makeTmpFile(): string {
  return path.join(os.tmpdir(), `mcp-firewall-test-${Date.now()}.json`);
}

describe('firewall rule naming', () => {
  it('generates deterministic rule name format', () => {
    const port = 3000;
    const id = 'abc12345';
    const ruleName = `MCP-LAN-${port}-${id}`;
    expect(ruleName).toBe('MCP-LAN-3000-abc12345');
  });

  it('encodes port and id in the rule name', () => {
    const port = 8080;
    const id = 'zz999999';
    const ruleName = `MCP-LAN-${port}-${id}`;
    expect(ruleName).toContain('8080');
    expect(ruleName).toContain('zz999999');
  });

  it('two different ids produce unique rule names for the same port', () => {
    const id1 = 'aaa00001';
    const id2 = 'bbb00002';
    expect(`MCP-LAN-8080-${id1}`).not.toBe(`MCP-LAN-8080-${id2}`);
  });
});

describe('scheduler reconcileExpired (no real netsh – dry-run on Linux)', () => {
  let tmpFile: string;
  let store: RuleStateStore;

  it('removes expired entries from the store', () => {
    tmpFile = makeTmpFile();
    store = new RuleStateStore(tmpFile);

    store.add({
      id: 'e1',
      ruleName: 'MCP-LAN-3001-e1',
      port: 3001,
      protocol: 'tcp',
      description: '',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 10_000).toISOString(), // already expired
    });

    store.add({
      id: 'a1',
      ruleName: 'MCP-LAN-3002-a1',
      port: 3002,
      protocol: 'tcp',
      description: '',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), // still active
    });

    reconcileExpired(store);

    expect(store.findById('e1')).toBeUndefined();
    expect(store.findById('a1')).toBeDefined();

    fs.unlinkSync(tmpFile);
  });
});
