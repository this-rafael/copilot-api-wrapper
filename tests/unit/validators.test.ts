import { describe, it, expect } from 'vitest';
import { parseClientMessage } from '../../src/protocol/validators.js';

describe('parseClientMessage', () => {
  describe('session.create', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'session.create',
        cwd: '/home/user/project',
        commandProfile: 'copilot-interactive',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional cols/rows', () => {
      const result = parseClientMessage({
        type: 'session.create',
        cwd: '/tmp',
        commandProfile: 'gh-copilot-suggest',
        cols: 120,
        rows: 40,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing cwd', () => {
      const result = parseClientMessage({
        type: 'session.create',
        commandProfile: 'copilot-interactive',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown commandProfile', () => {
      const result = parseClientMessage({
        type: 'session.create',
        cwd: '/tmp',
        commandProfile: 'evil-mode',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('terminal.input', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'terminal.input',
        sessionId: 'abc123',
        data: 'hello\n',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const result = parseClientMessage({ type: 'terminal.input', data: 'hello' });
      expect(result.success).toBe(false);
    });

    it('rejects missing data', () => {
      const result = parseClientMessage({ type: 'terminal.input', sessionId: 'abc123' });
      expect(result.success).toBe(false);
    });
  });

  describe('terminal.resize', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'terminal.resize',
        sessionId: 'abc123',
        cols: 80,
        rows: 24,
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive cols', () => {
      const result = parseClientMessage({
        type: 'terminal.resize',
        sessionId: 'abc123',
        cols: 0,
        rows: 24,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('session.close', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({ type: 'session.close', sessionId: 'abc123' });
      expect(result.success).toBe(true);
    });

    it('rejects empty sessionId', () => {
      const result = parseClientMessage({ type: 'session.close', sessionId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('context.search', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'context.search',
        sessionId: 'abc123',
        mentionType: 'file',
        query: 'server',
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty query for mention bootstrap', () => {
      const result = parseClientMessage({
        type: 'context.search',
        sessionId: 'abc123',
        mentionType: 'folder',
        query: '',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mention type', () => {
      const result = parseClientMessage({
        type: 'context.search',
        sessionId: 'abc123',
        mentionType: 'symbol',
        query: 'server',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid limit', () => {
      const result = parseClientMessage({
        type: 'context.search',
        sessionId: 'abc123',
        mentionType: 'file',
        query: 'server',
        limit: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('workspace.list', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({ type: 'workspace.list' });
      expect(result.success).toBe(true);
    });

    it('rejects unexpected payload fields', () => {
      const result = parseClientMessage({ type: 'workspace.list', sessionId: 'abc123' });
      expect(result.success).toBe(true);
    });
  });

  describe('workspace.addCustom', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'workspace.addCustom',
        path: '/home/user/custom-repo',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty path', () => {
      const result = parseClientMessage({
        type: 'workspace.addCustom',
        path: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('workspace.discoverGit', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'workspace.discoverGit',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('file.read', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'file.read',
        sessionId: 'abc123',
        path: 'src/server.ts',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty path', () => {
      const result = parseClientMessage({
        type: 'file.read',
        sessionId: 'abc123',
        path: '   ',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('file.write', () => {
    it('accepts valid payload', () => {
      const result = parseClientMessage({
        type: 'file.write',
        sessionId: 'abc123',
        path: 'src/server.ts',
        content: 'export const ok = true;\n',
        versionToken: '1:20',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing version token', () => {
      const result = parseClientMessage({
        type: 'file.write',
        sessionId: 'abc123',
        path: 'src/server.ts',
        content: 'export const ok = true;\n',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('autocomplete.request', () => {
    it('accepts documentPath when provided', () => {
      const result = parseClientMessage({
        type: 'autocomplete.request',
        sessionId: 'abc123',
        requestId: 1,
        text: 'const value = ',
        cursor: 14,
        documentPath: 'client/src/App.tsx',
        languageId: 'typescriptreact',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid messages', () => {
    it('rejects unknown type', () => {
      const result = parseClientMessage({ type: 'unknown.message', sessionId: 'abc' });
      expect(result.success).toBe(false);
    });

    it('rejects non-object', () => {
      const result = parseClientMessage('just a string');
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = parseClientMessage(null);
      expect(result.success).toBe(false);
    });

    it('rejects missing type field', () => {
      const result = parseClientMessage({ sessionId: 'abc', cwd: '/tmp' });
      expect(result.success).toBe(false);
    });
  });
});
