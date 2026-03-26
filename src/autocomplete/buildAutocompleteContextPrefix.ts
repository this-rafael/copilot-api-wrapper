interface BuildAutocompleteContextPrefixOptions {
  workspaceTree: string;
  recentInteractions: string;
}

export function buildAutocompleteContextPrefix(options: BuildAutocompleteContextPrefixOptions): string {
  const sections: string[] = [];

  if (options.workspaceTree.trim()) {
    sections.push([
      '<!-- workspace-tree -->',
      'Workspace tree:',
      options.workspaceTree.trim(),
    ].join('\n'));
  }

  if (options.recentInteractions.trim()) {
    sections.push([
      '<!-- recent-terminal-interactions -->',
      'Recent terminal interactions:',
      options.recentInteractions.trim(),
    ].join('\n'));
  }

  if (sections.length === 0) {
    return '';
  }

  return `${sections.join('\n\n')}\n\n<!-- current-user-prompt -->\n`;
}
