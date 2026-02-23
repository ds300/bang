export type LangTag = "tl" | "nl";

export interface TextSegment {
  text: string;
  lang: LangTag;
}

/**
 * Parse <tl>...</tl> and <nl>...</nl> tags from text into segments.
 * Untagged text is assigned `defaultLang`.
 * Strips presentational tags like <listen> before parsing.
 */
export function parseLangTags(text: string, defaultLang: LangTag): TextSegment[] {
  const cleaned = text.replace(/<\/?listen>/g, "");
  const segments: TextSegment[] = [];
  const regex = /<(tl|nl)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: cleaned.slice(lastIndex, match.index),
        lang: defaultLang,
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
      lang: defaultLang,
    });
  }

  const merged: TextSegment[] = [];
  for (const seg of segments) {
    if (!seg.text.trim()) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.lang === seg.lang) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

/**
 * Strip all language tags from text, returning plain text.
 */
export function stripLangTags(text: string): string {
  return text.replace(/<\/?(?:tl|nl|listen)>/g, "");
}
