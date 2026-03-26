import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RuleStateStore } from '../src/state.js';

function makeTmpFile(): string {
  return path.join(os.tmpdir(), `mcp-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeEntry(overrides?: Partial<Parameters<RuleStateStore['add']>[0]>) {
  return {
    id: 'abc12345',
    ruleName: 'MCP-LAN-8081-abc12345',
    localPort: 8080,
    publicPort: 8081,
    protocol: 'tcp' as const,
    description: '',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('RuleStateStore', () => {
  let tmpFile: string;
  let store: RuleStateStore;

  beforeEach(() => {
    tmpFile = makeTmpFile();
    store = new RuleStateStore(tmpFile);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('starts empty', () => {
    expect(store.getAll()).toHaveLength(0);
  });

  it('adds and retrieves a rule by ID', () => {
    const entry = makeEntry();
    store.add(entry);
    expect(store.getAll()).toHaveLength(1);
    expect(store.findById('abc12345')).toEqual(entry);
  });

  it('removes a rule', () => {
    store.add(makeEntry());
    store.remove('abc12345');
    expect(store.getAll()).toHaveLength(0);
  });

  it('distinguishes expired from active rules', () => {
    const expired = makeEntry({
      id: 'old1',
      ruleName: 'MCP-LAN-3001-old1',
      localPort: 3000,
      publicPort: 3001,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const active = makeEntry({
      id: 'new1',
      ruleName: 'MCP-LAN-4001-new1',
      localPort: 4000,
      publicPort: 4001,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    store.add(expired);
    store.add(active);

    expect(store.getExpired()).toHaveLength(1);
    expect(store.getExpired()[0].id).toBe('old1');
    expect(store.getActive()).toHaveLength(1);
    expect(store.getActive()[0].id).toBe('new1');
  });

  it('persists state across reloads', () => {
    store.add(makeEntry({ id: 'persist1', ruleName: 'MCP-LAN-5001-persist1', localPort: 5000, publicPort: 5001 }));
    const store2 = new RuleStateStore(tmpFile);
    expect(store2.findById('persist1')).toBeDefined();
    expect(store2.findById('persist1')?.localPort).toBe(5000);
    expect(store2.findById('persist1')?.publicPort).toBe(5001);
  });

  it('findByPort returns the active rule matching the publicPort', () => {
    store.add(makeEntry({ id: 'p1', ruleName: 'MCP-LAN-9001-p1', localPort: 9000, publicPort: 9001 }));
    expect(store.findByPort(9001)).toBeDefined();
    expect(store.findByPort(9000)).toBeUndefined(); // localPort is not indexed
    expect(store.findByPort(9002)).toBeUndefined();
  });

  it('findByPort does not return expired rules', () => {
    store.add(
      makeEntry({
        id: 'expired',
        ruleName: 'MCP-LAN-7071-expired',
        localPort: 7070,
        publicPort: 7071,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    expect(store.findByPort(7071)).toBeUndefined();
  });
});
