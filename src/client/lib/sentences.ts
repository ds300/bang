/**
 * Split text into clauses for clickable translation spans.
 * Splits on commas, semicolons, colons, and sentence-ending punctuation,
 * keeping the punctuation attached to the preceding text.
 */
export function splitClauses(text: string): string[] {
  const parts = text.split(/(?<=[,;:.!?¿¡])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

export interface TextSegment {
  text: string;
  isTargetLang: boolean;
}

/**
 * Parse <tl>...</tl> tags from text into segments.
 * Text inside tags is target language (clickable), text outside is native.
 */
export function parseTargetLangTags(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /<tl>([\s\S]*?)<\/tl>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isTargetLang: false,
      });
    }
    segments.push({
      text: match[1]!,
      isTargetLang: true,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isTargetLang: false,
    });
  }

  return segments;
}

/**
 * Strip <tl>...</tl> tags from text, returning plain text.
 */
export function stripTargetLangTags(text: string): string {
  return text.replace(/<tl>([\s\S]*?)<\/tl>/g, "$1");
}
