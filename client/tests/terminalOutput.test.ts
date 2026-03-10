import { describe, expect, it } from 'vitest';
import { buildOutputHistoryFromTerminalSnapshot } from '../src/lib/terminalOutput';

describe('buildOutputHistoryFromTerminalSnapshot', () => {
  it('turns xterm buffer rows into separate copyable lines', () => {
    const items = buildOutputHistoryFromTerminalSnapshot([
      { text: 'def soma(a, b):' },
      { text: '    return a + b' },
      { text: '' },
      { text: 'print(soma(2, 3))' },
    ]);

    expect(items.map((item) => item.displayText)).toEqual([
      'def soma(a, b):',
      '    return a + b',
      '',
      'print(soma(2, 3))',
    ]);
  });

  it('merges wrapped terminal rows and trims duplicated blank regions', () => {
    const items = buildOutputHistoryFromTerminalSnapshot([
      { text: '' },
      { text: 'Uma linha longa que quebrou', isWrapped: false },
      { text: ' no viewport', isWrapped: true },
      { text: '' },
      { text: '' },
      { text: 'linha final', isWrapped: false },
      { text: '' },
    ]);

    expect(items.map((item) => item.displayText)).toEqual([
      'Uma linha longa que quebrou no viewport',
      '',
      'linha final',
    ]);
  });
});