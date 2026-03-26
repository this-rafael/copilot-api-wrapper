import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';

const JAVASCRIPT_EXTENSION = javascript();
const JSX_EXTENSION = javascript({ jsx: true });
const TYPESCRIPT_EXTENSION = javascript({ typescript: true });
const TSX_EXTENSION = javascript({ typescript: true, jsx: true });
const JSON_EXTENSION = json();
const CSS_EXTENSION = css();
const HTML_EXTENSION = html();
const MARKDOWN_EXTENSION = markdown();
const YAML_EXTENSION = yaml();
const PLAIN_TEXT_EXTENSION: Extension = [];

function normalizePath(filePath: string): string {
  return filePath.trim().toLowerCase();
}

export function detectLanguageId(filePath: string): string {
  const normalized = normalizePath(filePath);

  if (normalized.endsWith('.tsx')) {
    return 'typescriptreact';
  }
  if (normalized.endsWith('.ts') || normalized.endsWith('.mts') || normalized.endsWith('.cts')) {
    return 'typescript';
  }
  if (normalized.endsWith('.jsx')) {
    return 'javascriptreact';
  }
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return 'javascript';
  }
  if (normalized.endsWith('.json') || normalized.endsWith('.jsonc')) {
    return 'json';
  }
  if (normalized.endsWith('.css') || normalized.endsWith('.scss') || normalized.endsWith('.less')) {
    return 'css';
  }
  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) {
    return 'html';
  }
  if (normalized.endsWith('.md') || normalized.endsWith('.mdx')) {
    return 'markdown';
  }
  if (normalized.endsWith('.yaml') || normalized.endsWith('.yml')) {
    return 'yaml';
  }

  return 'plaintext';
}

export function createFileLanguageExtension(filePath: string): Extension {
  switch (detectLanguageId(filePath)) {
    case 'typescriptreact':
      return TSX_EXTENSION;
    case 'typescript':
      return TYPESCRIPT_EXTENSION;
    case 'javascriptreact':
      return JSX_EXTENSION;
    case 'javascript':
      return JAVASCRIPT_EXTENSION;
    case 'json':
      return JSON_EXTENSION;
    case 'css':
      return CSS_EXTENSION;
    case 'html':
      return HTML_EXTENSION;
    case 'markdown':
      return MARKDOWN_EXTENSION;
    case 'yaml':
      return YAML_EXTENSION;
    default:
      return PLAIN_TEXT_EXTENSION;
  }
}