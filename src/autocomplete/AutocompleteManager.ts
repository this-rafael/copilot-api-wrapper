import { buildChildEnv, resolveGitHubToken, resolveGitHubUserHint } from '../cli/environment.js';
import { CopilotLanguageServerCommandFactory } from '../cli/CopilotLanguageServerCommandFactory.js';
import { CopilotAutocompleteSession } from './CopilotAutocompleteSession.js';

interface AutocompleteManagerDependencies {
  buildCommand?: typeof CopilotLanguageServerCommandFactory.build;
  buildEnv?: typeof buildChildEnv;
  createSession?: (options: ConstructorParameters<typeof CopilotAutocompleteSession>[0]) => CopilotAutocompleteSession;
  customServerPath?: string;
  selectedCompletionModel?: string;
}

export class AutocompleteManager {
  private readonly sessions = new Map<string, CopilotAutocompleteSession>();
  private readonly buildCommand: typeof CopilotLanguageServerCommandFactory.build;
  private readonly buildEnv: typeof buildChildEnv;
  private readonly createSessionInstance: (
    options: ConstructorParameters<typeof CopilotAutocompleteSession>[0]
  ) => CopilotAutocompleteSession;
  private readonly customServerPath?: string;
  private readonly selectedCompletionModel?: string;

  constructor(dependencies: AutocompleteManagerDependencies = {}) {
    this.buildCommand = dependencies.buildCommand ?? CopilotLanguageServerCommandFactory.build;
    this.buildEnv = dependencies.buildEnv ?? buildChildEnv;
    this.createSessionInstance = dependencies.createSession ?? ((options) => new CopilotAutocompleteSession(options));
    this.customServerPath = dependencies.customServerPath;
    this.selectedCompletionModel = dependencies.selectedCompletionModel?.trim() || undefined;
  }

  create(sessionId: string, cwd: string): CopilotAutocompleteSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const { command, args } = this.buildCommand(this.customServerPath);
    const env = this.buildEnv();
    const session = this.createSessionInstance({
      sessionId,
      cwd,
      command,
      args,
      env,
      githubToken: resolveGitHubToken(env),
      githubUser: resolveGitHubUserHint(env),
      selectedCompletionModel: this.selectedCompletionModel,
    });

    this.sessions.set(sessionId, session);
    session.once('exit', () => {
      this.sessions.delete(sessionId);
    });

    return session;
  }

  get(sessionId: string): CopilotAutocompleteSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    session.close();
  }

  closeAll(): void {
    for (const [sessionId, session] of this.sessions) {
      this.sessions.delete(sessionId);
      session.close();
    }
  }
}
