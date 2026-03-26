import { simpleGit } from 'simple-git';
import { logger } from '../observability/logger.js';

export interface GitFileChange {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitStatusResult {
  branch: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  label: string;
}

export interface GitBranchesResult {
  current: string;
  branches: GitBranch[];
}

export class GitService {
  private git(cwd: string) {
    return simpleGit({ baseDir: cwd });
  }

  async status(cwd: string): Promise<GitStatusResult> {
    const result = await this.git(cwd).status();
    return {
      branch: result.current,
      tracking: result.tracking,
      ahead: result.ahead,
      behind: result.behind,
      staged: result.staged.map((p) => ({ path: p, index: 'M', working_dir: ' ' })),
      unstaged: [
        ...result.modified.map((p) => ({ path: p, index: ' ', working_dir: 'M' })),
        ...result.deleted.map((p) => ({ path: p, index: ' ', working_dir: 'D' })),
      ],
      untracked: result.not_added,
      conflicted: result.conflicted,
    };
  }

  async diff(cwd: string, staged: boolean, filePath?: string): Promise<string> {
    const args: string[] = staged ? ['--staged'] : [];
    if (filePath) args.push('--', filePath);
    return this.git(cwd).diff(args);
  }

  async log(cwd: string, maxCount: number): Promise<GitCommit[]> {
    const result = await this.git(cwd).log({ maxCount });
    return result.all.map((c) => ({
      hash: c.hash,
      date: c.date,
      message: c.message,
      author_name: c.author_name,
      author_email: c.author_email,
    }));
  }

  async stage(cwd: string, paths: string[]): Promise<void> {
    await this.git(cwd).add(paths);
    logger.debug({ cwd, paths }, 'git stage');
  }

  async unstage(cwd: string, paths: string[]): Promise<void> {
    await this.git(cwd).reset(['HEAD', '--', ...paths]);
    logger.debug({ cwd, paths }, 'git unstage');
  }

  async commit(cwd: string, message: string): Promise<{ hash: string; message: string }> {
    const result = await this.git(cwd).commit(message);
    return { hash: result.commit, message };
  }

  async push(cwd: string, remote?: string, branch?: string): Promise<void> {
    const pushArgs: string[] = [];
    if (remote) pushArgs.push(remote);
    if (branch) pushArgs.push(branch);
    await this.git(cwd).push(pushArgs);
    logger.debug({ cwd, remote, branch }, 'git push');
  }

  async pull(cwd: string, remote?: string, branch?: string): Promise<string> {
    const pullArgs: string[] = [];
    if (remote) pullArgs.push(remote);
    if (branch) pullArgs.push(branch);
    const result = await this.git(cwd).pull(pullArgs);
    return `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`;
  }

  async branches(cwd: string): Promise<GitBranchesResult> {
    const result = await this.git(cwd).branch(['-a']);
    const branches: GitBranch[] = Object.values(result.branches).map((b) => ({
      name: b.name,
      current: b.current,
      remote: b.name.startsWith('remotes/'),
      label: b.label,
    }));
    return { current: result.current, branches };
  }

  async checkout(cwd: string, branch: string, createNew: boolean): Promise<void> {
    if (createNew) {
      await this.git(cwd).checkoutLocalBranch(branch);
    } else {
      await this.git(cwd).checkout(branch);
    }
    logger.debug({ cwd, branch, createNew }, 'git checkout');
  }
}
