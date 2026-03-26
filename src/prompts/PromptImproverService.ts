import { execFile } from 'child_process';
import { promisify } from 'util';
import { CopilotCommandFactory, type CliCommand } from '../cli/CopilotCommandFactory.js';
import { buildChildEnv } from '../cli/environment.js';
import { logger } from '../observability/logger.js';

const execFileAsync = promisify(execFile);
const PROMPT_IMPROVER_MODEL = 'gpt-5.4';
const PROMPT_IMPROVER_TIMEOUT_MS = 180_000;
const PROMPT_IMPROVER_MAX_BUFFER_BYTES = 1024 * 1024;

export type PromptImproverRunner = (instruction: string) => Promise<string>;

function buildPromptImproverInstruction(prompt: string, sessionContext: string): string {
  const normalizedPrompt = prompt.trim();
  const normalizedContext = sessionContext.trim() || 'Sessão recém iniciada, sem histórico relevante.';

  return [
    'Você é um especialista em engenharia de prompts para desenvolvimento de software.',
    'Sua tarefa é reescrever o prompt do usuário para ficar mais claro, específico e acionável.',
    'Não use ferramentas, não examine arquivos, não execute comandos e não peça esclarecimentos.',
    'Preserve a intenção original do usuário.',
    'Inclua contexto atual apenas quando ele realmente ajudar a executar a tarefa.',
    'Reforce boas práticas:',
    '- resultado aderente ao código e comportamento já existentes',
    '- uso dos MCPs configurados quando fizer sentido',
    '- explicação final em alto nível para o usuário',
    'Retorne apenas o prompt final otimizado, pronto para uso. Sem prefácio, sem markdown e sem explicações extras.',
    '',
    'Prompt original:',
    normalizedPrompt,
    '',
    'Contexto atual da sessão:',
    normalizedContext,
  ].join('\n');
}

function resolveCopilotPromptCommand(): CliCommand {
  const copilotPath = CopilotCommandFactory.findInPath('copilot');
  if (copilotPath) {
    return {
      command: copilotPath,
      args: [],
    };
  }

  const ghPath = CopilotCommandFactory.findInPath('gh');
  if (ghPath) {
    return {
      command: ghPath,
      args: ['copilot', '--'],
    };
  }

  throw new Error('Nem `copilot` nem `gh` CLI foram encontrados no PATH para executar o Prompt Improver.');
}

async function runCopilotPromptImprover(instruction: string): Promise<string> {
  const { command, args } = resolveCopilotPromptCommand();
  const env = buildChildEnv();
  const cliArgs = [
    ...args,
    '-p',
    instruction,
    '--model',
    PROMPT_IMPROVER_MODEL,
    '--allow-all-tools',
    '--no-auto-update',
    '--stream',
    'off',
    '-s',
  ];

  try {
    const { stdout, stderr } = await execFileAsync(command, cliArgs, {
      cwd: process.cwd(),
      env: {
        ...env,
        TERM: env.TERM ?? 'xterm-256color',
      },
      timeout: PROMPT_IMPROVER_TIMEOUT_MS,
      maxBuffer: PROMPT_IMPROVER_MAX_BUFFER_BYTES,
    });

    const improvedPrompt = stdout.trim();
    if (!improvedPrompt) {
      const stderrText = stderr.trim();
      throw new Error(
        stderrText
          ? `Resposta vazia do Copilot CLI ao melhorar o prompt: ${stderrText}`
          : 'Resposta vazia do Copilot CLI ao melhorar o prompt.',
      );
    }

    return improvedPrompt;
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException & {
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };

    if (typedError.killed || typedError.signal === 'SIGTERM') {
      throw new Error('O Prompt Improver excedeu o tempo limite ao chamar o Copilot CLI.');
    }

    const stderrText = typedError.stderr?.trim();
    if (stderrText) {
      throw new Error(`Falha ao executar o Prompt Improver via Copilot CLI: ${stderrText}`);
    }

    throw new Error(`Falha ao executar o Prompt Improver via Copilot CLI: ${typedError.message}`);
  }
}

export class PromptImproverService {
  constructor(
    private readonly githubToken?: string,
    private readonly runner: PromptImproverRunner = runCopilotPromptImprover,
  ) {}

  async improve(prompt: string, sessionContext: string): Promise<string> {
    const instruction = buildPromptImproverInstruction(prompt, sessionContext);
    logger.debug({ model: PROMPT_IMPROVER_MODEL }, 'PromptImprover: generating improved prompt via Copilot CLI');
    return this.runner(instruction);
  }

  get configuredGitHubToken(): string | undefined {
    return this.githubToken;
  }
}

export const promptImproverInternals = {
  buildPromptImproverInstruction,
  resolveCopilotPromptCommand,
  runCopilotPromptImprover,
};
