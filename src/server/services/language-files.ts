import { readFile, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");

export function langDir(lang: string): string {
  return path.join(DATA_DIR, lang);
}

export function sessionsDir(lang: string): string {
  return path.join(langDir(lang), "sessions");
}

const LANG_FILES = [
  "summary.md",
  "learned.md",
  "review.md",
  "current.md",
  "plan.md",
  "future.md",
] as const;

export type LangFileName = (typeof LANG_FILES)[number];

export interface LanguageContext {
  lang: string;
  files: Record<LangFileName, string | null>;
  isNew: boolean;
}

export async function readLanguageContext(
  lang: string,
): Promise<LanguageContext> {
  const dir = langDir(lang);
  const isNew = !existsSync(dir);

  if (isNew) {
    return {
      lang,
      files: Object.fromEntries(
        LANG_FILES.map((f) => [f, null]),
      ) as Record<LangFileName, null>,
      isNew: true,
    };
  }

  const files: Record<string, string | null> = {};
  for (const file of LANG_FILES) {
    const filePath = path.join(dir, file);
    try {
      files[file] = await readFile(filePath, "utf-8");
    } catch {
      files[file] = null;
    }
  }

  return { lang, files: files as Record<LangFileName, string | null>, isNew };
}

export async function ensureLangDir(lang: string): Promise<void> {
  await mkdir(langDir(lang), { recursive: true });
  await mkdir(sessionsDir(lang), { recursive: true });
}

export async function getNextSessionFilename(
  lang: string,
): Promise<string> {
  const dir = sessionsDir(lang);
  await mkdir(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  let num = 1;

  while (
    existsSync(
      path.join(dir, `${today}-${String(num).padStart(2, "0")}.md`),
    )
  ) {
    num++;
  }

  return `${today}-${String(num).padStart(2, "0")}.md`;
}

export async function writeSessionFile(
  lang: string,
  filename: string,
  content: string,
): Promise<string> {
  const filePath = path.join(sessionsDir(lang), filename);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}
