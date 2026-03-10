import type { ContextSearchItem, MentionType } from './protocol';

export interface ActiveMention {
  token: string;
  tokenStart: number;
  tokenEnd: number;
  mentionType: MentionType;
  query: string;
}

export function parseActiveMention(value: string, cursor: number): ActiveMention | null {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const beforeCursor = value.slice(0, safeCursor);
  const explicitMentions: Array<{ prefix: '@file' | '@folder' | '@workspace'; type: MentionType }> = [
    { prefix: '@file', type: 'file' },
    { prefix: '@folder', type: 'folder' },
    { prefix: '@workspace', type: 'workspace' },
  ];

  for (const mention of explicitMentions) {
    const tokenStart = beforeCursor.lastIndexOf(mention.prefix);
    if (tokenStart === -1) {
      continue;
    }

    const boundaryIndex = tokenStart - 1;
    if (boundaryIndex >= 0 && !/\s/u.test(beforeCursor[boundaryIndex] ?? '')) {
      continue;
    }

    const token = value.slice(tokenStart, safeCursor);
    return buildMention(token, tokenStart, safeCursor, mention.type, mention.prefix);
  }

  const tokenStart = beforeCursor.lastIndexOf('@');
  if (tokenStart === -1) {
    return null;
  }

  const boundaryIndex = tokenStart - 1;
  if (boundaryIndex >= 0 && !/\s/u.test(beforeCursor[boundaryIndex] ?? '')) {
    return null;
  }

  const token = value.slice(tokenStart, safeCursor);
  return {
    token,
    tokenStart,
    tokenEnd: safeCursor,
    mentionType: 'file',
    query: token.slice(1).trim(),
  };
}

function buildMention(
  token: string,
  tokenStart: number,
  tokenEnd: number,
  mentionType: MentionType,
  prefix: '@file' | '@folder' | '@workspace',
): ActiveMention {
  return {
    token,
    tokenStart,
    tokenEnd,
    mentionType,
    query: token.slice(prefix.length).trim(),
  };
}

export function replaceActiveMention(value: string, mention: ActiveMention, item: ContextSearchItem): string {
  const prefix = `@${mention.mentionType}`;
  const replacement = item.kind === 'workspace' ? `${prefix} ` : `${prefix} ${item.path} `;
  const suffix = value.slice(mention.tokenEnd);
  const normalizedSuffix = replacement.endsWith(' ') && suffix.startsWith(' ') ? suffix.slice(1) : suffix;
  return `${value.slice(0, mention.tokenStart)}${replacement}${normalizedSuffix}`;
}