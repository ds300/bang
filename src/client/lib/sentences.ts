/**
 * Split text into clauses for clickable translation spans.
 * Splits on commas, semicolons, colons, and sentence-ending punctuation,
 * keeping the punctuation attached to the preceding text.
 */
export function splitClauses(text: string): string[] {
  const parts = text.split(/(?<=[,;:.!?¿¡])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

export type LangTag = "tl" | "nl";

export interface TextSegment {
  text: string;
  lang: LangTag | null;
}

/**
 * Parse <tl>...</tl> and <nl>...</nl> tags from text into segments.
 * Strips presentational tags like <listen> before parsing.
 */
export function parseLangTags(text: string): TextSegment[] {
  const cleaned = text.replace(/<\/?listen>/g, "");
  const segments: TextSegment[] = [];
  const regex = /<(tl|nl)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: cleaned.slice(lastIndex, match.index),
        lang: null,
      });
    }
    segments.push({
      text: match[2]!,
      lang: match[1] as LangTag,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    segments.push({
      text: cleaned.slice(lastIndex),
      lang: null,
    });
  }

  return segments;
}

/**
 * Strip all language tags from text, returning plain text.
 */
export function stripLangTags(text: string): string {
  return text.replace(/<\/?(?:tl|nl|listen)>/g, "");
}
