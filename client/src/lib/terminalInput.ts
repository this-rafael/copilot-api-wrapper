export const PROMPT_SUBMIT_DELAY_MS = 80;
export const ENTER_SUBMIT_SEQUENCE = '\r';
export const CTRL_S_SUBMIT_SEQUENCE = '\u0013';

export function getPromptSubmitSequence(profile: 'copilot-interactive' | 'gh-copilot-suggest'): string {
  return ENTER_SUBMIT_SEQUENCE;
}

export function submitPromptToTerminal(
  sendInput: (data: string) => void,
  prompt: string,
  submitSequence = ENTER_SUBMIT_SEQUENCE,
  schedule: typeof window.setTimeout = window.setTimeout,
  cancelScheduled: typeof window.clearTimeout = window.clearTimeout,
): () => void {
  sendInput(prompt);

  const handle = schedule(() => {
    sendInput(submitSequence);
  }, PROMPT_SUBMIT_DELAY_MS);

  return () => {
    cancelScheduled(handle);
  };
}