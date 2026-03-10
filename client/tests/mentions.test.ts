import { describe, expect, it } from 'vitest';
import { parseActiveMention, replaceActiveMention } from '../src/lib/mentions';

describe('mentions helpers', () => {
  it('parses @file mention with query', () => {
    const mention = parseActiveMention('explique @file src/ser', 'explique @file src/ser'.length);
    expect(mention).toMatchObject({ mentionType: 'file', query: 'src/ser' });
  });

  it('replaces only the active mention token', () => {
    const value = 'compare @file src/ser com o resto';
    const mention = parseActiveMention(value, 'compare @file src/ser'.length);
    if (!mention) {
      throw new Error('Mention not parsed');
    }

    const replaced = replaceActiveMention(value, mention, {
      id: 'src/server.ts',
      kind: 'file',
      label: 'server.ts',
      path: 'src/server.ts',
      description: 'src/server.ts',
    });

    expect(replaced).toBe('compare @file src/server.ts com o resto');
  });
});