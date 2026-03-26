import fs from 'fs/promises';
import path from 'path';
import type { WorkspaceRegistry } from './WorkspaceRegistry.js';

function toVersionPart(value: number | bigint): string {
  return typeof value === 'bigint' ? value.toString() : Math.trunc(value).toString();
}

function buildVersionToken(stats: { mtimeMs: number | bigint; size: number | bigint }): string {
  return `${toVersionPart(stats.mtimeMs)}:${toVersionPart(stats.size)}`;
}

function normalizeRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('O caminho do arquivo nao pode estar vazio.');
  }

  if (path.isAbsolute(trimmed)) {
    throw new Error('Selecione um arquivo relativo ao workspace atual.');
  }

  const normalized = path.posix.normalize(trimmed.replace(/\\+/g, '/'));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('O caminho do arquivo precisa permanecer dentro do workspace atual.');
  }

  return normalized;
}

export interface WorkspaceFileDocument {
  path: string;
  content: string;
  versionToken: string;
}

export interface WorkspaceFileSaveResult {
  path: string;
  versionToken: string;
}

export class WorkspaceFileService {
  constructor(private readonly workspaceRegistry: WorkspaceRegistry) {}

  async readFile(cwd: string, relativePath: string): Promise<WorkspaceFileDocument> {
    const resolved = await this.resolveExistingFile(cwd, relativePath);
    const content = await fs.readFile(resolved.absolutePath, 'utf8');

    return {
      path: resolved.relativePath,
      content,
      versionToken: buildVersionToken(resolved.stats),
    };
  }

  async writeFile(
    cwd: string,
    relativePath: string,
    content: string,
    expectedVersionToken: string,
  ): Promise<WorkspaceFileSaveResult> {
    const resolved = await this.resolveExistingFile(cwd, relativePath);
    const currentVersionToken = buildVersionToken(resolved.stats);

    if (currentVersionToken !== expectedVersionToken) {
      throw new Error('O arquivo mudou no servidor. Reabra o arquivo antes de salvar novamente.');
    }

    await fs.writeFile(resolved.absolutePath, content, 'utf8');
    const updatedStats = await fs.stat(resolved.absolutePath);

    return {
      path: resolved.relativePath,
      versionToken: buildVersionToken(updatedStats),
    };
  }

  async resolveDocumentPath(cwd: string, relativePath: string): Promise<string> {
    const resolved = await this.resolveExistingFile(cwd, relativePath);
    return resolved.absolutePath;
  }

  private async resolveExistingFile(cwd: string, relativePath: string): Promise<{
    absolutePath: string;
    relativePath: string;
    stats: Awaited<ReturnType<typeof fs.stat>>;
  }> {
    await this.workspaceRegistry.validateCwd(cwd);

    const normalizedRelativePath = normalizeRelativePath(relativePath);
    const realWorkspacePath = await fs.realpath(cwd);
    const lexicalPath = path.resolve(realWorkspacePath, ...normalizedRelativePath.split('/'));

    if (lexicalPath !== realWorkspacePath && !lexicalPath.startsWith(`${realWorkspacePath}${path.sep}`)) {
      throw new Error('O caminho do arquivo precisa permanecer dentro do workspace atual.');
    }

    const absolutePath = await fs.realpath(lexicalPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new Error(`Arquivo nao encontrado: ${normalizedRelativePath}`);
      }

      throw error;
    });

    if (absolutePath !== realWorkspacePath && !absolutePath.startsWith(`${realWorkspacePath}${path.sep}`)) {
      throw new Error('O caminho resolvido do arquivo saiu do workspace permitido.');
    }

    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`O caminho selecionado nao e um arquivo editavel: ${normalizedRelativePath}`);
    }

    return {
      absolutePath,
      relativePath: normalizedRelativePath,
      stats,
    };
  }
}