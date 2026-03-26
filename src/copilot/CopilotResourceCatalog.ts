import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { CopilotResourceItem } from '../protocol/messages.js';
import type { WorkspaceRegistry } from '../workspaces/WorkspaceRegistry.js';

const WORKSPACE_SKILL_DIRECTORIES = [
  ['.github', 'skills'],
  ['.agents', 'skills'],
  ['.claude', 'skills'],
] as const;
const WORKSPACE_PROMPT_DIRECTORIES = [['.github', 'prompts']] as const;
const WORKSPACE_MCP_FILES = ['mcp.json', '.mcp.json', path.join('.vscode', 'mcp.json')] as const;

interface ResourceLocation {
  directoryPath: string;
  scope: 'workspace' | 'local';
  originLabel: string;
  workspacePath?: string;
}

interface ConfigFileLocation {
  filePath: string;
  scope: 'workspace' | 'local';
  originLabel: string;
  workspacePath?: string;
}

interface CopilotResourceCatalogOptions {
  homeDir?: string;
  skillDirectories?: string[];
  promptDirectories?: string[];
  mcpConfigFiles?: string[];
}

function normalizeLabel(value: string): string {
  return value
    .replace(/\.prompt$/i, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function parseSimpleFrontmatter(content: string): Record<string, string | boolean> {
  if (!content.startsWith('---\n')) {
    return {};
  }

  const endMarkerIndex = content.indexOf('\n---', 4);
  if (endMarkerIndex === -1) {
    return {};
  }

  const rawFrontmatter = content.slice(4, endMarkerIndex).split('\n');
  const metadata: Record<string, string | boolean> = {};

  for (const line of rawFrontmatter) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const trimmedValue = rawValue.trim().replace(/^['\"]|['\"]$/g, '');
    if (trimmedValue === 'true') {
      metadata[key] = true;
      continue;
    }

    if (trimmedValue === 'false') {
      metadata[key] = false;
      continue;
    }

    metadata[key] = trimmedValue;
  }

  return metadata;
}

function getWorkspaceAncestors(workspacePath: string): string[] {
  const ancestors: string[] = [];
  let currentPath = path.resolve(workspacePath);

  while (true) {
    ancestors.push(currentPath);
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return ancestors;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function buildLocalPaths(homeDir: string, options: CopilotResourceCatalogOptions): {
  skillDirectories: string[];
  promptDirectories: string[];
  mcpConfigFiles: string[];
} {
  const xdgConfigHome = process.env['XDG_CONFIG_HOME']?.trim();
  const copilotConfigRoot = xdgConfigHome
    ? path.join(xdgConfigHome, 'copilot')
    : path.join(homeDir, '.copilot');

  const defaultSkillDirectories = [
    path.join(copilotConfigRoot, 'skills'),
    path.join(homeDir, '.claude', 'skills'),
  ];
  const defaultPromptDirectories = [path.join(copilotConfigRoot, 'prompts')];
  const defaultMcpConfigFiles = [
    path.join(copilotConfigRoot, 'mcp.json'),
    path.join(homeDir, '.config', 'Code', 'User', 'mcp.json'),
    path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json'),
  ];

  return {
    skillDirectories: options.skillDirectories ?? defaultSkillDirectories,
    promptDirectories: options.promptDirectories ?? defaultPromptDirectories,
    mcpConfigFiles: options.mcpConfigFiles ?? defaultMcpConfigFiles,
  };
}

export class CopilotResourceCatalog {
  constructor(
    private readonly workspaceRegistry: WorkspaceRegistry,
    private readonly options: CopilotResourceCatalogOptions = {},
  ) {}

  async listResources(): Promise<CopilotResourceItem[]> {
    const workspaces = await this.workspaceRegistry.getAllowedWorkspaces();
    const homeDir = this.options.homeDir ?? os.homedir();
    const localPaths = buildLocalPaths(homeDir, this.options);

    const skillLocations = new Map<string, ResourceLocation>();
    const promptLocations = new Map<string, ResourceLocation>();
    const mcpLocations = new Map<string, ConfigFileLocation>();

    for (const workspace of workspaces) {
      for (const ancestor of getWorkspaceAncestors(workspace.path)) {
        for (const segments of WORKSPACE_SKILL_DIRECTORIES) {
          const directoryPath = path.join(ancestor, ...segments);
          skillLocations.set(directoryPath, {
            directoryPath,
            scope: 'workspace',
            originLabel: workspace.name,
            workspacePath: workspace.path,
          });
        }

        for (const segments of WORKSPACE_PROMPT_DIRECTORIES) {
          const directoryPath = path.join(ancestor, ...segments);
          promptLocations.set(directoryPath, {
            directoryPath,
            scope: 'workspace',
            originLabel: workspace.name,
            workspacePath: workspace.path,
          });
        }

        for (const relativeFilePath of WORKSPACE_MCP_FILES) {
          const filePath = path.join(ancestor, relativeFilePath);
          mcpLocations.set(filePath, {
            filePath,
            scope: 'workspace',
            originLabel: workspace.name,
            workspacePath: workspace.path,
          });
        }
      }
    }

    for (const directoryPath of localPaths.skillDirectories) {
      skillLocations.set(directoryPath, {
        directoryPath,
        scope: 'local',
        originLabel: 'Pessoal',
      });
    }

    for (const directoryPath of localPaths.promptDirectories) {
      promptLocations.set(directoryPath, {
        directoryPath,
        scope: 'local',
        originLabel: 'Pessoal',
      });
    }

    for (const filePath of localPaths.mcpConfigFiles) {
      mcpLocations.set(filePath, {
        filePath,
        scope: 'local',
        originLabel: 'Pessoal',
      });
    }

    const [skills, prompts, mcpServers] = await Promise.all([
      this.collectSkills(Array.from(skillLocations.values())),
      this.collectPrompts(Array.from(promptLocations.values())),
      this.collectMcpServers(Array.from(mcpLocations.values())),
    ]);

    return [...skills, ...prompts, ...mcpServers].sort((left, right) => {
      const kindOrder = ['skill', 'prompt', 'mcp'];
      const byKind = kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);
      if (byKind !== 0) {
        return byKind;
      }

      const byScope = left.scope.localeCompare(right.scope);
      if (byScope !== 0) {
        return byScope;
      }

      return left.label.localeCompare(right.label);
    });
  }

  private async collectSkills(locations: ResourceLocation[]): Promise<CopilotResourceItem[]> {
    const items: CopilotResourceItem[] = [];

    for (const location of locations) {
      if (!(await pathExists(location.directoryPath))) {
        continue;
      }

      const entries = await fs.readdir(location.directoryPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillFilePath = path.join(location.directoryPath, entry.name, 'SKILL.md');
        const content = await readTextFile(skillFilePath);
        if (!content) {
          continue;
        }

        const metadata = parseSimpleFrontmatter(content);
        const name = String(metadata['name'] ?? entry.name).trim() || entry.name;
        const label = name;
        const description = String(metadata['description'] ?? `Skill detectada em ${entry.name}`).trim();

        items.push({
          id: `skill:${skillFilePath}`,
          kind: 'skill',
          scope: location.scope,
          label,
          description,
          invocation: `/${normalizeLabel(name)} `,
          sourcePath: skillFilePath,
          originLabel: location.originLabel,
          workspacePath: location.workspacePath,
        });
      }
    }

    return items;
  }

  private async collectPrompts(locations: ResourceLocation[]): Promise<CopilotResourceItem[]> {
    const items: CopilotResourceItem[] = [];

    for (const location of locations) {
      if (!(await pathExists(location.directoryPath))) {
        continue;
      }

      const entries = await fs.readdir(location.directoryPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.prompt.md')) {
          continue;
        }

        const promptFilePath = path.join(location.directoryPath, entry.name);
        const content = await readTextFile(promptFilePath);
        if (!content) {
          continue;
        }

        const metadata = parseSimpleFrontmatter(content);
        const fileStem = entry.name.replace(/\.prompt\.md$/i, '');
        const label = String(metadata['title'] ?? metadata['name'] ?? fileStem).trim() || fileStem;
        const description = String(metadata['description'] ?? `Prompt reutilizavel ${fileStem}`).trim();

        items.push({
          id: `prompt:${promptFilePath}`,
          kind: 'prompt',
          scope: location.scope,
          label,
          description,
          invocation: `/${normalizeLabel(fileStem)} `,
          sourcePath: promptFilePath,
          originLabel: location.originLabel,
          workspacePath: location.workspacePath,
        });
      }
    }

    return items;
  }

  private async collectMcpServers(locations: ConfigFileLocation[]): Promise<CopilotResourceItem[]> {
    const items: CopilotResourceItem[] = [];

    for (const location of locations) {
      const rawConfig = await readTextFile(location.filePath);
      if (!rawConfig) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawConfig);
      } catch {
        continue;
      }

      const candidateRecord = this.extractMcpRecord(parsed);
      for (const [serverName, serverConfig] of Object.entries(candidateRecord)) {
        if (!serverConfig || typeof serverConfig !== 'object') {
          continue;
        }

        const typedConfig = serverConfig as Record<string, unknown>;
        const transport = typeof typedConfig['type'] === 'string'
          ? typedConfig['type']
          : typeof typedConfig['command'] === 'string'
            ? 'stdio'
            : typeof typedConfig['url'] === 'string'
              ? 'http'
              : 'config';

        const description = `Servidor MCP (${transport}) detectado em ${path.basename(location.filePath)}`;

        items.push({
          id: `mcp:${location.filePath}:${serverName}`,
          kind: 'mcp',
          scope: location.scope,
          label: serverName,
          description,
          invocation: `/mcp show ${serverName}`,
          sourcePath: location.filePath,
          originLabel: location.originLabel,
          workspacePath: location.workspacePath,
        });
      }
    }

    return items;
  }

  private extractMcpRecord(parsed: unknown): Record<string, unknown> {
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const root = parsed as Record<string, unknown>;
    if (root['servers'] && typeof root['servers'] === 'object') {
      return root['servers'] as Record<string, unknown>;
    }

    return Object.fromEntries(
      Object.entries(root).filter(([, value]) => value && typeof value === 'object'),
    );
  }
}