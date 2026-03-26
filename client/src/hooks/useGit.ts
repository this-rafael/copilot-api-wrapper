import { useCallback, useEffect, useState } from 'react';
import type {
  ClientMessage,
  GitBranchesResultMessage,
  GitCommitInfo,
  GitDiffResultMessage,
  GitStatusResultMessage,
  ServerMessage,
} from '../lib/protocol';

type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

interface UseGitOptions {
  socketStatus: SocketStatus;
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  sendMessage: (message: ClientMessage) => void;
  cwd: string | null;
}

export function useGit(options: UseGitOptions) {
  const { socketStatus, addMessageListener, sendMessage, cwd } = options;

  const [gitStatus, setGitStatus] = useState<GitStatusResultMessage | null>(null);
  const [diff, setDiff] = useState<GitDiffResultMessage | null>(null);
  const [log, setLog] = useState<GitCommitInfo[]>([]);
  const [branches, setBranches] = useState<GitBranchesResultMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setGitStatus(null);
    setDiff(null);
    setLog([]);
    setBranches(null);
    setLoading(false);
    setErrorMessage(null);
  }, [cwd]);

  const refresh = useCallback(() => {
    if (!cwd) return;
    setLoading(true);
    setErrorMessage(null);
    sendMessage({ type: 'git.status', cwd });
    sendMessage({ type: 'git.log', cwd, maxCount: 30 });
    sendMessage({ type: 'git.branches', cwd });
  }, [cwd, sendMessage]);

  useEffect(() => {
    if (cwd && socketStatus === 'open') {
      refresh();
    }
  }, [cwd, socketStatus]);

  useEffect(() => {
    return addMessageListener((message) => {
      switch (message.type) {
        case 'git.status.results':
          if (message.cwd !== cwd) return;
          setGitStatus(message);
          setLoading(false);
          break;

        case 'git.diff.results':
          if (message.cwd !== cwd) return;
          setDiff(message);
          setLoading(false);
          break;

        case 'git.log.results':
          if (message.cwd !== cwd) return;
          setLog(message.commits);
          setLoading(false);
          break;

        case 'git.stage.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          refresh();
          break;

        case 'git.unstage.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          refresh();
          break;

        case 'git.commit.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          refresh();
          break;

        case 'git.push.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          break;

        case 'git.pull.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          refresh();
          break;

        case 'git.branches.results':
          if (message.cwd !== cwd) return;
          setBranches(message);
          setLoading(false);
          break;

        case 'git.checkout.results':
          if (message.cwd !== cwd) return;
          setLoading(false);
          refresh();
          break;

        case 'git.error':
          if (message.cwd !== cwd) return;
          setErrorMessage(message.message);
          setLoading(false);
          break;
      }
    });
  }, [addMessageListener, cwd, refresh]);

  const viewDiff = useCallback((path?: string, staged?: boolean) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.diff', cwd, path, staged });
  }, [cwd, sendMessage]);

  const clearDiff = useCallback(() => {
    setDiff(null);
  }, []);

  const stage = useCallback((paths: string[]) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.stage', cwd, paths });
  }, [cwd, sendMessage]);

  const unstage = useCallback((paths: string[]) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.unstage', cwd, paths });
  }, [cwd, sendMessage]);

  const commit = useCallback((message: string) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.commit', cwd, message });
  }, [cwd, sendMessage]);

  const push = useCallback((remote?: string, branch?: string) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.push', cwd, remote, branch });
  }, [cwd, sendMessage]);

  const pull = useCallback((remote?: string, branch?: string) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.pull', cwd, remote, branch });
  }, [cwd, sendMessage]);

  const checkout = useCallback((branch: string, createNew?: boolean) => {
    if (!cwd) return;
    setLoading(true);
    sendMessage({ type: 'git.checkout', cwd, branch, createNew });
  }, [cwd, sendMessage]);

  return {
    gitStatus,
    diff,
    log,
    branches,
    loading,
    errorMessage,
    refresh,
    viewDiff,
    clearDiff,
    stage,
    unstage,
    commit,
    push,
    pull,
    checkout,
  };
}
