import { afterEach, describe, expect, it, vi } from 'vitest';
import { CTRL_S_SUBMIT_SEQUENCE, ENTER_SUBMIT_SEQUENCE, getPromptSubmitSequence, PROMPT_SUBMIT_DELAY_MS, submitPromptToTerminal } from '../src/lib/terminalInput';

afterEach(() => {
  vi.useRealTimers();
});

describe('submitPromptToTerminal', () => {
  it('sends the prompt first and Enter shortly after by default', () => {
    vi.useFakeTimers();
    const sendInput = vi.fn();

    submitPromptToTerminal(sendInput, 'Oi tudo certo');

    expect(sendInput).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenNthCalledWith(1, 'Oi tudo certo');

    vi.advanceTimersByTime(PROMPT_SUBMIT_DELAY_MS - 1);
    expect(sendInput).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(sendInput).toHaveBeenCalledTimes(2);
    expect(sendInput).toHaveBeenNthCalledWith(2, ENTER_SUBMIT_SEQUENCE);
  });

  it('still supports custom submit sequences when explicitly requested', () => {
    vi.useFakeTimers();
    const sendInput = vi.fn();

    submitPromptToTerminal(sendInput, 'crie uma calculadora', CTRL_S_SUBMIT_SEQUENCE);

    vi.advanceTimersByTime(PROMPT_SUBMIT_DELAY_MS);

    expect(sendInput).toHaveBeenNthCalledWith(1, 'crie uma calculadora');
    expect(sendInput).toHaveBeenNthCalledWith(2, CTRL_S_SUBMIT_SEQUENCE);
  });

  it('maps both command profiles to Enter for current Copilot CLI sessions', () => {
    expect(getPromptSubmitSequence('copilot-interactive')).toBe(ENTER_SUBMIT_SEQUENCE);
    expect(getPromptSubmitSequence('gh-copilot-suggest')).toBe(ENTER_SUBMIT_SEQUENCE);
  });
});