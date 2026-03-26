import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { TerminalInteractionHistory } from '../autocomplete/TerminalInteractionHistory.js';
import { logger } from '../observability/logger.js';

export interface SessionOptions {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class CopilotSession extends EventEmitter {
  readonly id: string;
  readonly cwd: string;
  private readonly interactionHistory = new TerminalInteractionHistory();
  private ptyProcess: pty.IPty;
  private _exited = false;

  constructor(options: SessionOptions) {
    super();
    this.id = options.id;
    this.cwd = options.cwd;

    this.ptyProcess = pty.spawn(options.command, options.args, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env: options.env,
    });

    this.ptyProcess.onData((data) => {
      this.interactionHistory.recordOutput(data);
      this.emit('output', data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      if (this._exited) return;
      this._exited = true;
      logger.info({ sessionId: this.id, exitCode, signal }, 'PTY process exited');
      this.emit('exit', exitCode, signal !== undefined ? String(signal) : undefined);
      this.removeAllListeners();
    });

    logger.info({ sessionId: this.id, command: options.command, cwd: options.cwd }, 'PTY session started');
  }

  write(data: string): void {
    if (!this._exited) {
      this.interactionHistory.recordInput(data);
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (!this._exited) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill(signal = 'SIGTERM'): void {
    if (!this._exited) {
      this._exited = true;
      logger.info({ sessionId: this.id }, 'Killing PTY session');
      try {
        this.ptyProcess.kill(signal);
      } catch (err) {
        logger.warn({ sessionId: this.id, err }, 'Error killing PTY process');
      }
      this.emit('exit', null, signal);
      this.removeAllListeners();
    }
  }

  getRecentInteractionsContext(limit = 3): string {
    return this.interactionHistory.formatRecentInteractions(limit);
  }

  get exited(): boolean {
    return this._exited;
  }
}
