import type { PromptAutocompleteSuggestion } from './protocol';

function clampOffset(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function applyAutocompleteSuggestion(value: string, suggestion: PromptAutocompleteSuggestion): string {
  const replaceStart = clampOffset(suggestion.replaceStart, 0, value.length);
  const replaceEnd = clampOffset(suggestion.replaceEnd, replaceStart, value.length);

  return `${value.slice(0, replaceStart)}${suggestion.insertText}${value.slice(replaceEnd)}`;
}

export function getAutocompleteCursor(suggestion: PromptAutocompleteSuggestion): number {
  return suggestion.replaceStart + suggestion.insertText.length;
}

export function buildAutocompletePreview(
  value: string,
  cursor: number,
  suggestion: PromptAutocompleteSuggestion,
): string {
  const nextValue = applyAutocompleteSuggestion(value, suggestion);
  const previewStart = clampOffset(cursor, 0, nextValue.length);
  return nextValue.slice(previewStart);
}
