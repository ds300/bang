/**
 * Split text into clauses for clickable translation spans.
 * Splits on commas, semicolons, colons, and sentence-ending punctuation,
 * keeping the punctuation attached to the preceding text.
 */
export function splitClauses(text: string): string[] {
  const parts = text.split(/(?<=[,;:.!?¿¡])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

/**
 * Rough heuristic: does this text look like it's in a non-English language?
 * Checks for common non-ASCII characters, diacritics, or known patterns.
 */
export function looksLikeTargetLanguage(text: string): boolean {
  if (/[áéíóúñüàèìòùâêîôûäëïöüçãõ¿¡]/i.test(text)) return true;
  if (/[\u3000-\u9fff\uac00-\ud7af]/.test(text)) return true;
  if (/[\u0400-\u04ff]/.test(text)) return true;
  if (/[\u0600-\u06ff]/.test(text)) return true;
  return false;
}
