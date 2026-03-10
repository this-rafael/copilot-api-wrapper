export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API unavailable');
  }

  const fallbackField = document.createElement('textarea');
  fallbackField.value = text;
  fallbackField.setAttribute('readonly', 'true');
  fallbackField.style.position = 'fixed';
  fallbackField.style.opacity = '0';
  fallbackField.style.pointerEvents = 'none';
  document.body.appendChild(fallbackField);
  fallbackField.select();

  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  document.body.removeChild(fallbackField);

  if (!copied) {
    throw new Error('Clipboard API unavailable');
  }
}