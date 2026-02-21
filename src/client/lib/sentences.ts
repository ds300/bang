/**
 * Split text into sentences. Handles common punctuation patterns
 * including Spanish ¿ and ¡ markers.
 */
export function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const parts = text.split(/(?<=[.!?¿¡])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

/**
 * Rough heuristic: does this text look like it's in a non-English language?
 * Checks for common non-ASCII characters, diacritics, or known patterns.
 */
export function looksLikeTargetLanguage(text: string): boolean {
  // If it has diacritics or non-ASCII letters, likely target language
  if (/[áéíóúñüàèìòùâêîôûäëïöüçãõ¿¡]/i.test(text)) return true;
  // If it has CJK characters
  if (/[\u3000-\u9fff\uac00-\ud7af]/.test(text)) return true;
  // If it has Cyrillic
  if (/[\u0400-\u04ff]/.test(text)) return true;
  // If it has Arabic
  if (/[\u0600-\u06ff]/.test(text)) return true;
  return false;
}
