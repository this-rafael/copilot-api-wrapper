import type { MentionType } from './protocol';

export type CommandGroup = 'slash' | 'mention' | 'session';

export interface CommandCatalogItem {
  id: string;
  group: CommandGroup;
  label: string;
  insertText: string;
  description: string;
  aliases?: string[];
  warning?: string;
  requiresRepoContext?: boolean;
  mentionType?: MentionType;
  requiresBackendSearch?: boolean;
}

export const HOMOLOGATED_COPILOT_CLI_VERSION = '0.0.423';

export const commandCatalog: CommandCatalogItem[] = [
  {
    id: 'slash-help',
    group: 'slash',
    label: '/help',
    insertText: '/help ',
    description: 'Lista os comandos interativos disponiveis na sessao.',
  },
  {
    id: 'slash-clear',
    group: 'session',
    label: '/clear',
    insertText: '/clear ',
    description: 'Limpa o historico atual da conversa.',
    aliases: ['/new'],
  },
  {
    id: 'slash-compact',
    group: 'slash',
    label: '/compact',
    insertText: '/compact ',
    description: 'Compacta o historico para reduzir uso de contexto.',
  },
  {
    id: 'slash-context',
    group: 'slash',
    label: '/context',
    insertText: '/context ',
    description: 'Mostra o uso atual da janela de contexto.',
  },
  {
    id: 'slash-cwd',
    group: 'slash',
    label: '/cwd',
    insertText: '/cwd ',
    description: 'Mostra ou ajusta o diretorio de trabalho da sessao.',
    aliases: ['/cd'],
  },
  {
    id: 'slash-diff',
    group: 'slash',
    label: '/diff',
    insertText: '/diff ',
    description: 'Mostra um diff das alteracoes atuais do workspace.',
  },
  {
    id: 'slash-model',
    group: 'slash',
    label: '/model',
    insertText: '/model ',
    description: 'Seleciona ou mostra o modelo em uso.',
    aliases: ['/models'],
  },
  {
    id: 'slash-plan',
    group: 'slash',
    label: '/plan',
    insertText: '/plan ',
    description: 'Pede ao Copilot um plano antes de codificar.',
  },
  {
    id: 'slash-review',
    group: 'slash',
    label: '/review',
    insertText: '/review ',
    description: 'Solicita uma revisao de codigo ou alteracoes.',
  },
  {
    id: 'slash-session',
    group: 'slash',
    label: '/session',
    insertText: '/session ',
    description: 'Exibe informacoes, checkpoints e resumo da sessao atual.',
  },
  {
    id: 'slash-share',
    group: 'slash',
    label: '/share',
    insertText: '/share ',
    description: 'Compartilha a sessao em arquivo ou gist.',
  },
  {
    id: 'slash-theme',
    group: 'slash',
    label: '/theme',
    insertText: '/theme ',
    description: 'Mostra ou muda o tema interno do Copilot CLI.',
  },
  {
    id: 'slash-usage',
    group: 'slash',
    label: '/usage',
    insertText: '/usage ',
    description: 'Mostra metricas de uso da sessao.',
  },
  {
    id: 'slash-exit',
    group: 'session',
    label: '/exit',
    insertText: '/exit ',
    description: 'Encerra a sessao do Copilot CLI.',
    aliases: ['/quit'],
    warning: 'Encerra a sessao atual do CLI.',
  },
  {
    id: 'slash-login',
    group: 'session',
    label: '/login',
    insertText: '/login ',
    description: 'Inicia o fluxo de login do Copilot CLI.',
  },
  {
    id: 'slash-logout',
    group: 'session',
    label: '/logout',
    insertText: '/logout ',
    description: 'Faz logout da conta atual do Copilot CLI.',
    warning: 'Pode invalidar a sessao atual no dispositivo remoto.',
  },
  {
    id: 'mention-workspace',
    group: 'mention',
    label: '@workspace',
    insertText: '@workspace ',
    description: 'Inclui o contexto do workspace remoto atual.',
    mentionType: 'workspace',
    requiresRepoContext: true,
  },
  {
    id: 'mention-file',
    group: 'mention',
    label: '@file',
    insertText: '@file ',
    description: 'Busca arquivos no workspace remoto antes de inserir a mencao.',
    mentionType: 'file',
    requiresRepoContext: true,
    requiresBackendSearch: true,
  },
  {
    id: 'mention-folder',
    group: 'mention',
    label: '@folder',
    insertText: '@folder ',
    description: 'Busca diretorios no workspace remoto antes de inserir a mencao.',
    mentionType: 'folder',
    requiresRepoContext: true,
    requiresBackendSearch: true,
  },
];

export function searchCommandCatalog(items: CommandCatalogItem[], query: string): CommandCatalogItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const haystacks = [item.label, item.insertText, item.description, ...(item.aliases ?? [])];
    return haystacks.some((value) => value.toLowerCase().includes(normalized));
  });
}