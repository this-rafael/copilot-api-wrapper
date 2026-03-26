import type { SessionStatus } from '../hooks/useSession';

interface SessionTabsBarProps {
  sessions: Array<{
    id: string;
    label: string;
    path: string;
    status: SessionStatus;
    active: boolean;
    hasDraft: boolean;
  }>;
  onSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  onCloseSession: (sessionId: string) => void;
}

function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'creating':
      return 'Conectando';
    case 'active':
      return 'Ativa';
    case 'disconnected':
      return 'Offline';
    case 'error':
      return 'Erro';
    case 'closed':
      return 'Encerrada';
    default:
      return 'Pronta';
  }
}

export function SessionTabsBar({ sessions, onSelect, onCreateSession, onCloseSession }: SessionTabsBarProps) {
  return (
    <div className="session-tabs">
      <div className="session-tabs__list" role="tablist" aria-label="Sessoes abertas">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-tab${session.active ? ' session-tab--active' : ''}`}
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              aria-selected={session.active}
              aria-label={`Alternar para workspace ${session.label}`}
              className="session-tab__trigger"
              onClick={() => onSelect(session.id)}
            >
              <span className="session-tab__label-row">
                <strong>{session.label}</strong>
                <span className={`session-tab__state session-tab__state--${session.status}`}>{getStatusLabel(session.status)}</span>
              </span>
              <span className="session-tab__meta-row">
                <span className="session-tab__path">{session.path}</span>
                {session.hasDraft ? <span className="session-tab__draft">Rascunho</span> : null}
              </span>
            </button>
            <button
              type="button"
              className="session-tab__close"
              aria-label={`Fechar sessao do workspace ${session.label}`}
              onClick={() => onCloseSession(session.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="session-tabs__create" onClick={onCreateSession}>
        + Sessao
      </button>
    </div>
  );
}