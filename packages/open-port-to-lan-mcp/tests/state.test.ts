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
    ruleName: 'MCP-LAN-8080-abc12345',
    port: 8080,
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
      ruleName: 'MCP-LAN-3000-old1',
      port: 3000,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const active = makeEntry({
      id: 'new1',
      ruleName: 'MCP-LAN-4000-new1',
      port: 4000,
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
    store.add(makeEntry({ id: 'persist1', ruleName: 'MCP-LAN-5000-persist1', port: 5000 }));
    const store2 = new RuleStateStore(tmpFile);
    expect(store2.findById('persist1')).toBeDefined();
    expect(store2.findById('persist1')?.port).toBe(5000);
  });

  it('findByPort returns the active rule for a port', () => {
    store.add(makeEntry({ id: 'p1', ruleName: 'MCP-LAN-9000-p1', port: 9000 }));
    expect(store.findByPort(9000)).toBeDefined();
    expect(store.findByPort(9001)).toBeUndefined();
  });

  it('findByPort does not return expired rules', () => {
    store.add(
      makeEntry({
        id: 'expired',
        ruleName: 'MCP-LAN-7070-expired',
        port: 7070,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    expect(store.findByPort(7070)).toBeUndefined();
  });
});
