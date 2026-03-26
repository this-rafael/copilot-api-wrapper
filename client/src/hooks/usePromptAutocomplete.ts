import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAutocompleteSuggestion, buildAutocompletePreview, getAutocompleteCursor } from '../lib/autocomplete';
import type {
  AutocompleteResultsMessage,
  AutocompleteStatusMessage,
  PromptAutocompleteSuggestion,
} from '../lib/protocol';

export type PromptAutocompleteState = 'idle' | 'loading' | 'ready' | 'error';

export interface PromptAutocompleteSnapshot {
  items: PromptAutocompleteSuggestion[];
  status: PromptAutocompleteState;
  message: string | null;
  latestRequestId: number;
  authBlocked: boolean;
}

const AUTOCOMPLETE_DEBOUNCE_MS = 650;
const AUTOCOMPLETE_MIN_PROMPT_LENGTH = 12;
const AUTOCOMPLETE_MIN_ACTIVE_TOKEN_LENGTH = 4;

export function shouldRequestPromptAutocomplete(value: string, cursor: number): boolean {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  if (safeCursor !== value.length) {
    return false;
  }

  const beforeCursor = value.slice(0, safeCursor);
  if (beforeCursor.trim().length < AUTOCOMPLETE_MIN_PROMPT_LENGTH) {
    return false;
  }

  if (beforeCursor.trimEnd().length !== beforeCursor.length) {
    return false;
  }

  const activeLine = beforeCursor.slice(beforeCursor.lastIndexOf('\n') + 1);
  const trailingToken = /([^\s]+)$/u.exec(activeLine)?.[1] ?? '';
  if (trailingToken.length < AUTOCOMPLETE_MIN_ACTIVE_TOKEN_LENGTH) {
    return false;
  }

  return /[\p{L}\p{N}_]/u.test(trailingToken);
}

function isAuthenticationAutocompleteMessage(message: string): boolean {
  return /notauthenticated|notsignedin|sign(?:ed)?[ -]?in/i.test(message);
}

function normalizeAutocompleteMessage(message: string): string {
  return isAuthenticationAutocompleteMessage(message)
    ? 'Copilot sem autenticacao valida no backend de autocomplete'
    : message;
}

interface UsePromptAutocompleteOptions {
  value: string;
  cursor: number;
  rawMode: boolean;
  sessionKey?: string;
  disabled?: boolean;
  sessionStatus: 'idle' | 'creating' | 'active' | 'closed' | 'error' | 'disconnected';
  requestAutocomplete: (
    requestId: number,
    text: string,
    cursor: number,
    languageId?: string,
    tabSize?: number,
    insertSpaces?: boolean,
  ) => void;
  acceptAutocomplete: (suggestionId: string) => void;
  addAutocompleteResultsListener: (listener: (message: AutocompleteResultsMessage) => void) => () => void;
  addAutocompleteStatusListener: (listener: (message: AutocompleteStatusMessage) => void) => () => void;
  snapshot?: PromptAutocompleteSnapshot;
  onSnapshotChange?: (snapshot: PromptAutocompleteSnapshot) => void;
}

export function usePromptAutocomplete(options: UsePromptAutocompleteOptions) {
  const {
    value,
    cursor,
    rawMode,
    sessionKey,
    disabled = false,
    sessionStatus,
    requestAutocomplete,
    acceptAutocomplete,
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
    snapshot,
    onSnapshotChange,
  } = options;

  const [items, setItems] = useState<PromptAutocompleteSuggestion[]>(snapshot?.items ?? []);
  const [status, setStatus] = useState<PromptAutocompleteState>(snapshot?.status ?? 'idle');
  const [message, setMessage] = useState<string | null>(snapshot?.message ?? null);

  const latestRequestIdRef = useRef(snapshot?.latestRequestId ?? 0);
  const statusRef = useRef<PromptAutocompleteState>(snapshot?.status ?? 'idle');
  const authBlockedRef = useRef(snapshot?.authBlocked ?? false);
  const onSnapshotChangeRef = useRef(onSnapshotChange);

  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);

  useEffect(() => {
    setItems(snapshot?.items ?? []);
    setStatus(snapshot?.status ?? 'idle');
    setMessage(snapshot?.message ?? null);
    latestRequestIdRef.current = snapshot?.latestRequestId ?? 0;
    statusRef.current = snapshot?.status ?? 'idle';
    authBlockedRef.current = snapshot?.authBlocked ?? false;
  }, [sessionKey, snapshot]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    onSnapshotChangeRef.current?.({
      items,
      status,
      message,
      latestRequestId: latestRequestIdRef.current,
      authBlocked: authBlockedRef.current,
    });
  }, [items, message, status]);

  const reset = useCallback(() => {
    setItems((current) => (current.length === 0 ? current : []));
    setStatus((current) => (current === 'idle' ? current : 'idle'));
    setMessage((current) => (current === null ? current : null));
  }, []);

  const clearAuthBlock = useCallback(() => {
    authBlockedRef.current = false;
  }, []);

  useEffect(() => {
    return addAutocompleteResultsListener((result) => {
      if (result.requestId !== latestRequestIdRef.current) {
        return;
      }

      setItems(result.items);
      setStatus(result.items.length > 0 ? 'ready' : 'idle');
    });
  }, [addAutocompleteResultsListener]);

  useEffect(() => {
    return addAutocompleteStatusListener((event) => {
      if (!event.message) {
        return;
      }

      if (event.kind === 'Error' || event.kind === 'Inactive') {
        if (isAuthenticationAutocompleteMessage(event.message)) {
          authBlockedRef.current = true;
          setItems([]);
          setStatus('idle');
          setMessage(normalizeAutocompleteMessage(event.message));
          return;
        }

        setItems([]);
        setStatus('error');
        setMessage(normalizeAutocompleteMessage(event.message));
        return;
      }

      if (event.kind === 'Warning') {
        setMessage(normalizeAutocompleteMessage(event.message));
        return;
      }

      if (event.kind === 'Normal') {
        clearAuthBlock();

        if (statusRef.current === 'error') {
          setStatus('idle');
        }

        setMessage(null);
      }
    });
  }, [addAutocompleteStatusListener, clearAuthBlock]);

  useEffect(() => {
    if (disabled || rawMode || sessionStatus !== 'active' || value.trim().length === 0) {
      clearAuthBlock();
      reset();
      return;
    }

    if (cursor !== value.length) {
      reset();
      return;
    }

    if (authBlockedRef.current) {
      setItems((current) => (current.length === 0 ? current : []));
      setStatus((current) => (current === 'idle' ? current : 'idle'));
      return;
    }

    if (!shouldRequestPromptAutocomplete(value, cursor)) {
      reset();
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setStatus('loading');
    setMessage(null);

    const handle = window.setTimeout(() => {
      requestAutocomplete(requestId, value, cursor, 'markdown', 2, true);
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [clearAuthBlock, cursor, disabled, rawMode, requestAutocomplete, reset, sessionStatus, value]);

  const primarySuggestion = items[0] ?? null;

  const preview = useMemo(() => {
    if (!primarySuggestion) {
      return null;
    }

    const nextPreview = buildAutocompletePreview(value, cursor, primarySuggestion).trimEnd();
    return nextPreview.length > 0 ? nextPreview : null;
  }, [cursor, primarySuggestion, value]);

  const acceptSelected = useCallback(() => {
    if (!primarySuggestion) {
      return null;
    }

    acceptAutocomplete(primarySuggestion.id);
    const nextValue = applyAutocompleteSuggestion(value, primarySuggestion);
    const nextCursor = getAutocompleteCursor(primarySuggestion);
    setItems([]);
    setStatus('idle');
    setMessage(null);

    return {
      value: nextValue,
      cursor: nextCursor,
    };
  }, [acceptAutocomplete, primarySuggestion, value]);

  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  return {
    items,
    status,
    message,
    preview,
    acceptSelected,
    dismiss,
  };
}
