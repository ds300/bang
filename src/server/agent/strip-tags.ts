export function stripLangTags(text: string): string {
  return text.replace(/<\/?(?:tl|nl)>/g, "");
}
