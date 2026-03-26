const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g;
const OTHER_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u0012\u0014-\u001f\u007f]/g;
const SUBMIT_CHARACTERS = new Set(['\r', '\n', '\u0013']);

export interface TerminalInteraction {
  prompt: string;
  response: string;
}

function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function sanitizeOutput(value: string): string {
  return stripAnsiSequences(value)
    .replace(OTHER_CONTROL_PATTERN, '')
    .replace(/\r\n?/g, '\n');
}

function compactWhitespace(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMultiline(value: string, maxLength: number): string {
  const normalized = value
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export class TerminalInteractionHistory {
  private readonly interactions: TerminalInteraction[] = [];
  private activeInteraction: TerminalInteraction | null = null;
  private pendingPrompt = '';

  constructor(private readonly maxStoredInteractions = 12) {}

  recordInput(chunk: string): void {
    if (!chunk) {
      return;
    }

    const sanitizedChunk = stripAnsiSequences(chunk);
    for (const char of sanitizedChunk) {
      if (SUBMIT_CHARACTERS.has(char)) {
        this.commitPrompt();
        continue;
      }

      if (char === '\b' || char === '\u007f') {
        this.pendingPrompt = this.pendingPrompt.slice(0, -1);
        continue;
      }

      if (char < ' ' && char !== '\t') {
        continue;
      }

      this.pendingPrompt += char;
    }
  }

  recordOutput(chunk: string): void {
    if (!this.activeInteraction || !chunk) {
      return;
    }

    const sanitizedChunk = sanitizeOutput(chunk);
    if (!sanitizedChunk.trim()) {
      return;
    }

    this.activeInteraction.response = `${this.activeInteraction.response}${sanitizedChunk}`;
  }

  getRecentInteractions(limit = 3): TerminalInteraction[] {
    return this.interactions
      .slice(-Math.max(1, limit))
      .map((interaction) => ({
        prompt: interaction.prompt,
        response: interaction.response,
      }));
  }

  formatRecentInteractions(limit = 3): string {
    const recentInteractions = this.getRecentInteractions(limit);
    if (recentInteractions.length === 0) {
      return '';
    }

    return recentInteractions
      .map((interaction, index) => {
        const prompt = compactMultiline(compactWhitespace(interaction.prompt), 240);
        const response = compactMultiline(interaction.response, 900);

        return [
          `Interaction ${index + 1} prompt: ${prompt || '(empty)'}`,
          `Interaction ${index + 1} response: ${response || '(no output yet)'}`,
        ].join('\n');
      })
      .join('\n\n');
  }

  private commitPrompt(): void {
    const prompt = compactWhitespace(this.pendingPrompt);
    this.pendingPrompt = '';
    if (!prompt) {
      return;
    }

    const interaction: TerminalInteraction = {
      prompt,
      response: '',
    };

    this.interactions.push(interaction);
    if (this.interactions.length > this.maxStoredInteractions) {
      this.interactions.splice(0, this.interactions.length - this.maxStoredInteractions);
    }

    this.activeInteraction = interaction;
  }
}
