import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAutocompleteSuggestion, buildAutocompletePreview, getAutocompleteCursor } from '../lib/autocomplete';
import type {
  AutocompleteResultsMessage,
  AutocompleteStatusMessage,
  PromptAutocompleteSuggestion,
} from '../lib/protocol';
import type { SessionStatus } from './useSession';

type DocumentAutocompleteState = 'idle' | 'loading' | 'ready' | 'error';

const DOCUMENT_AUTOCOMPLETE_DEBOUNCE_MS = 420;
const REQUEST_ID_OFFSET = 1_000_000;

function isAuthenticationAutocompleteMessage(message: string): boolean {
  return /notauthenticated|notsignedin|sign(?:ed)?[ -]?in/i.test(message);
}

function normalizeAutocompleteMessage(message: string): string {
  return isAuthenticationAutocompleteMessage(message)
    ? 'Copilot sem autenticacao valida no backend de autocomplete'
    : message;
}

function shouldRequestDocumentAutocomplete(value: string, cursor: number): boolean {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const beforeCursor = value.slice(0, safeCursor);
  if (beforeCursor.trim().length === 0) {
    return false;
  }

  if (/\s$/u.test(beforeCursor)) {
    return false;
  }

  const activeLine = beforeCursor.slice(beforeCursor.lastIndexOf('\n') + 1);
  const trailingToken = /([\p{L}\p{N}_$][^\s]*)$/u.exec(activeLine)?.[1] ?? '';
  return trailingToken.length >= 2;
}

interface UseDocumentAutocompleteOptions {
  value: string;
  cursor: number;
  documentPath: string | null;
  languageId: string;
  disabled?: boolean;
  sessionStatus: SessionStatus;
  requestAutocomplete: (
    requestId: number,
    text: string,
    cursor: number,
    languageId?: string,
    tabSize?: number,
    insertSpaces?: boolean,
    documentPath?: string,
  ) => void;
  acceptAutocomplete: (suggestionId: string) => void;
  addAutocompleteResultsListener: (listener: (message: AutocompleteResultsMessage) => void) => () => void;
  addAutocompleteStatusListener: (listener: (message: AutocompleteStatusMessage) => void) => () => void;
}

export function useDocumentAutocomplete(options: UseDocumentAutocompleteOptions) {
  const {
    value,
    cursor,
    documentPath,
    languageId,
    disabled = false,
    sessionStatus,
    requestAutocomplete,
    acceptAutocomplete,
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
  } = options;

  const [items, setItems] = useState<PromptAutocompleteSuggestion[]>([]);
  const [status, setStatus] = useState<DocumentAutocompleteState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const latestRequestIdRef = useRef(REQUEST_ID_OFFSET);
  const statusRef = useRef<DocumentAutocompleteState>('idle');
  const authBlockedRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
    if (disabled || sessionStatus !== 'active' || !documentPath) {
      clearAuthBlock();
      reset();
      return;
    }

    if (authBlockedRef.current) {
      setItems((current) => (current.length === 0 ? current : []));
      setStatus((current) => (current === 'idle' ? current : 'idle'));
      return;
    }

    if (!shouldRequestDocumentAutocomplete(value, cursor)) {
      reset();
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setStatus('loading');
    setMessage(null);

    const handle = window.setTimeout(() => {
      requestAutocomplete(requestId, value, cursor, languageId, 2, true, documentPath);
    }, DOCUMENT_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [clearAuthBlock, cursor, disabled, documentPath, languageId, requestAutocomplete, reset, sessionStatus, value]);

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