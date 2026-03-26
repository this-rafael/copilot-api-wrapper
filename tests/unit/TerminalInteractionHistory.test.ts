import { describe, expect, it } from 'vitest';
import { TerminalInteractionHistory } from '../../src/autocomplete/TerminalInteractionHistory.js';

describe('TerminalInteractionHistory', () => {
  it('formats the last three prompt and response interactions', () => {
    const history = new TerminalInteractionHistory();

    history.recordInput('first');
    history.recordInput('\r');
    history.recordOutput('first response\n');

    history.recordInput('second');
    history.recordInput('\r');
    history.recordOutput('second response\n');

    history.recordInput('third');
    history.recordInput('\r');
    history.recordOutput('third response\n');

    history.recordInput('fourth');
    history.recordInput('\r');
    history.recordOutput('fourth response\n');

    const formatted = history.formatRecentInteractions(3);

    expect(formatted).not.toContain('first response');
    expect(formatted).toContain('Interaction 1 prompt: second');
    expect(formatted).toContain('Interaction 2 prompt: third');
    expect(formatted).toContain('Interaction 3 prompt: fourth');
    expect(formatted).toContain('Interaction 3 response: fourth response');
  });

  it('handles backspace and ctrl+s submits when capturing prompts', () => {
    const history = new TerminalInteractionHistory();

    history.recordInput('helo');
    history.recordInput('\b');
    history.recordInput('lo');
    history.recordInput('\u0013');
    history.recordOutput('done');

    expect(history.getRecentInteractions(1)).toEqual([
      {
        prompt: 'hello',
        response: 'done',
      },
    ]);
  });
});
