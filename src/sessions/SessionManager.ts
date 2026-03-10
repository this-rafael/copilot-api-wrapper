import { nanoid } from 'nanoid';
import { CopilotSession } from './CopilotSession.js';
import { CopilotCommandFactory } from '../cli/CopilotCommandFactory.js';
import { buildChildEnv } from '../cli/environment.js';
import { logger } from '../observability/logger.js';
import type { SessionCreateMessage } from '../protocol/messages.js';
import type { WorkspaceRegistry } from '../workspaces/WorkspaceRegistry.js';

interface SessionManagerDependencies {
  buildCommand?: typeof CopilotCommandFactory.build;
  buildEnv?: typeof buildChildEnv;
  createSession?: (options: ConstructorParameters<typeof CopilotSession>[0]) => CopilotSession;
  workspaceRegistry: WorkspaceRegistry;
}

export class SessionManager {
  private sessions = new Map<string, CopilotSession>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxSessions: number;
  private readonly timeoutMs: number;
  private readonly buildCommand: typeof CopilotCommandFactory.build;
  private readonly buildEnv: typeof buildChildEnv;
  private readonly createSessionInstance: (options: ConstructorParameters<typeof CopilotSession>[0]) => CopilotSession;
  private readonly workspaceRegistry: WorkspaceRegistry;

  constructor(maxSessions: number, timeoutMs: number, dependencies: SessionManagerDependencies) {
    this.maxSessions = maxSessions;
    this.timeoutMs = timeoutMs;
    this.buildCommand = dependencies.buildCommand ?? CopilotCommandFactory.build;
    this.buildEnv = dependencies.buildEnv ?? buildChildEnv;
    this.createSessionInstance = dependencies.createSession ?? ((options) => new CopilotSession(options));
    this.workspaceRegistry = dependencies.workspaceRegistry;
  }

  async create(msg: SessionCreateMessage): Promise<CopilotSession> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum session limit (${this.maxSessions}) reached`);
    }

    await this.workspaceRegistry.validateCwd(msg.cwd);

    const { command, args } = this.buildCommand(msg.commandProfile);
    const env = this.buildEnv();
    const id = nanoid();

    const session = this.createSessionInstance({
      id,
      command,
      args,
      cwd: msg.cwd,
      env,
      cols: msg.cols,
      rows: msg.rows,
    });

    this.sessions.set(id, session);
    this.resetTimeout(id);

    session.on('exit', () => {
      this.clearSession(id);
    });

    logger.info({ sessionId: id }, 'Session registered in manager');
    return session;
  }

  get(sessionId: string): CopilotSession | undefined {
    return this.sessions.get(sessionId);
  }

  touch(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.resetTimeout(sessionId);
    }
  }

  delete(sessionId: string): void {
    this.clearSession(sessionId);
  }

  killAll(): void {
    for (const [id, session] of this.sessions) {
      session.kill();
      this.clearTimeout(id);
    }
    this.sessions.clear();
  }

  private resetTimeout(sessionId: string): void {
    this.clearTimeout(sessionId);
    const handle = setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session) {
        logger.info({ sessionId }, 'Session timed out, killing');
        session.kill();
        this.clearSession(sessionId);
      }
    }, this.timeoutMs);
    this.timeouts.set(sessionId, handle);
  }

  private clearTimeout(sessionId: string): void {
    const handle = this.timeouts.get(sessionId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.timeouts.delete(sessionId);
    }
  }

  private clearSession(sessionId: string): void {
    this.clearTimeout(sessionId);
    this.sessions.delete(sessionId);
  }
}
