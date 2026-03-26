import { useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  GitBranchesResultMessage,
  GitCommitInfo,
  GitDiffResultMessage,
  GitStatusResultMessage,
} from '../lib/protocol';

interface GitPanelProps {
  open: boolean;
  cwd: string | null;
  gitStatus: GitStatusResultMessage | null;
  diff: GitDiffResultMessage | null;
  log: GitCommitInfo[];
  branches: GitBranchesResultMessage | null;
  loading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onCommit: (message: string) => void;
  onPush: () => void;
  onPull: () => void;
  onViewDiff: (path?: string, staged?: boolean) => void;
  onClearDiff: () => void;
  onCheckout: (branch: string) => void;
  onClose: () => void;
}

type GitTab = 'changes' | 'log' | 'branches';

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function GitPanel({
  open,
  gitStatus,
  diff,
  log,
  branches,
  loading,
  errorMessage,
  onRefresh,
  onStage,
  onUnstage,
  onCommit,
  onPush,
  onPull,
  onViewDiff,
  onClearDiff,
  onCheckout,
  onClose,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<GitTab>('changes');
  const [commitMessage, setCommitMessage] = useState('');

  if (!open) return null;

  const branch = gitStatus?.branch ?? null;
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const staged = gitStatus?.staged ?? [];
  const unstaged = gitStatus?.unstaged ?? [];
  const untracked = gitStatus?.untracked ?? [];
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0;

  function handleCommit() {
    if (!canCommit) return;
    onCommit(commitMessage.trim());
    setCommitMessage('');
  }

  const panel = (
    <>
      <div className="git-panel-backdrop" onClick={onClose} />
      <aside className="git-panel" role="dialog" aria-modal="true" aria-label="Painel Git">
        <div className="git-panel__header">
          <div className="git-panel__header-left">
            <button type="button" className="ghost-button git-panel__close" onClick={onClose} aria-label="Fechar painel Git">
              ✕
            </button>
            <button
              type="button"
              className="ghost-button git-panel__refresh"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Atualizar status Git"
            >
              ⟳
            </button>
            <span className="git-panel__title">
              Git{branch ? ` — ${branch}` : ''}
              {(ahead > 0 || behind > 0) ? (
                <span className="git-panel__sync-info">
                  {ahead > 0 ? ` ${ahead}↑` : ''}
                  {behind > 0 ? ` ${behind}↓` : ''}
                </span>
              ) : null}
            </span>
          </div>
          <div className="git-panel__header-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={onPush}
              disabled={loading}
              title="Enviar commits"
            >
              ↑ Push
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onPull}
              disabled={loading}
              title="Receber commits"
            >
              ↓ Pull
            </button>
          </div>
        </div>

        <div className="git-panel__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'changes'}
            className={`git-panel__tab${activeTab === 'changes' ? ' git-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('changes')}
          >
            Mudanças
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'log'}
            className={`git-panel__tab${activeTab === 'log' ? ' git-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('log')}
          >
            Log
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'branches'}
            className={`git-panel__tab${activeTab === 'branches' ? ' git-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('branches')}
          >
            Branches
          </button>
        </div>

        <div className="git-panel__body">
          {diff ? (
            <div className="git-panel__diff-view">
              <div className="git-panel__diff-header">
                <button type="button" className="ghost-button" onClick={onClearDiff}>
                  ← Voltar
                </button>
                <span className="git-panel__diff-title">
                  {diff.path ?? 'Todas as mudanças'}
                  <span className="git-panel__diff-kind">
                    {diff.staged ? ' (staged)' : ' (working)'}
                  </span>
                </span>
              </div>
              <pre className="git-panel__diff-content">{diff.diff || '(sem diferenças)'}</pre>
            </div>
          ) : activeTab === 'changes' ? (
            <div className="git-panel__changes">
              <div className="git-panel__commit-area">
                <textarea
                  className="git-panel__commit-input"
                  placeholder="Mensagem do commit…"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={3}
                />
                <button
                  type="button"
                  className="ghost-button git-panel__commit-btn"
                  disabled={!canCommit || loading}
                  onClick={handleCommit}
                >
                  Commit{staged.length > 0 ? ` (${staged.length})` : ''}
                </button>
              </div>

              {errorMessage ? (
                <div className="git-panel__error">{errorMessage}</div>
              ) : null}

              {staged.length > 0 ? (
                <section className="git-panel__section">
                  <div className="git-panel__section-title">
                    STAGED <span className="git-panel__count">({staged.length})</span>
                  </div>
                  {staged.map((file) => (
                    <div key={file.path} className="git-panel__file-row">
                      <button
                        type="button"
                        className="git-panel__file-name"
                        onClick={() => onViewDiff(file.path, true)}
                        title={`Ver diff de ${file.path}`}
                      >
                        <span className="git-panel__file-status">{file.index}</span>
                        {file.path}
                      </button>
                      <button
                        type="button"
                        className="git-panel__file-action git-panel__file-action--unstage"
                        onClick={() => onUnstage([file.path])}
                        title="Remover do stage"
                        aria-label={`Remover ${file.path} do stage`}
                      >
                        −
                      </button>
                    </div>
                  ))}
                </section>
              ) : null}

              {unstaged.length > 0 ? (
                <section className="git-panel__section">
                  <div className="git-panel__section-title">
                    ALTERAÇÕES <span className="git-panel__count">({unstaged.length})</span>
                  </div>
                  {unstaged.map((file) => (
                    <div key={file.path} className="git-panel__file-row">
                      <button
                        type="button"
                        className="git-panel__file-name"
                        onClick={() => onViewDiff(file.path, false)}
                        title={`Ver diff de ${file.path}`}
                      >
                        <span className="git-panel__file-status">{file.working_dir}</span>
                        {file.path}
                      </button>
                      <button
                        type="button"
                        className="git-panel__file-action git-panel__file-action--stage"
                        onClick={() => onStage([file.path])}
                        title="Adicionar ao stage"
                        aria-label={`Adicionar ${file.path} ao stage`}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </section>
              ) : null}

              {untracked.length > 0 ? (
                <section className="git-panel__section">
                  <div className="git-panel__section-title">
                    NÃO RASTREADOS <span className="git-panel__count">({untracked.length})</span>
                  </div>
                  {untracked.map((filePath) => (
                    <div key={filePath} className="git-panel__file-row">
                      <span className="git-panel__file-name git-panel__file-name--untracked">
                        <span className="git-panel__file-status">?</span>
                        {filePath}
                      </span>
                      <button
                        type="button"
                        className="git-panel__file-action git-panel__file-action--stage"
                        onClick={() => onStage([filePath])}
                        title="Adicionar ao stage"
                        aria-label={`Adicionar ${filePath} ao stage`}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </section>
              ) : null}

              {staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && !loading ? (
                <p className="git-panel__empty">Nenhuma alteração pendente.</p>
              ) : null}
            </div>
          ) : activeTab === 'log' ? (
            <div className="git-panel__log">
              {log.length === 0 && !loading ? (
                <p className="git-panel__empty">Nenhum commit encontrado.</p>
              ) : null}
              {log.map((commit) => (
                <div key={commit.hash} className="git-panel__commit-row">
                  <div className="git-panel__commit-hash">{commit.hash.slice(0, 7)}</div>
                  <div className="git-panel__commit-body">
                    <div className="git-panel__commit-message">{commit.message}</div>
                    <div className="git-panel__commit-meta">
                      {commit.author_name} · {formatDate(commit.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="git-panel__branches">
              {!branches || branches.branches.length === 0 && !loading ? (
                <p className="git-panel__empty">Nenhum branch encontrado.</p>
              ) : null}
              {branches?.branches.map((b) => (
                <div
                  key={b.name}
                  className={`git-panel__branch-row${b.current ? ' git-panel__branch-row--current' : ''}`}
                >
                  <span className="git-panel__branch-name">
                    {b.current ? '● ' : '  '}{b.label}
                  </span>
                  {!b.current ? (
                    <button
                      type="button"
                      className="ghost-button git-panel__checkout-btn"
                      onClick={() => onCheckout(b.name)}
                      disabled={loading}
                    >
                      Checkout
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}
