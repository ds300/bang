import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chrome has high-quality "Google" voices that sound natural.
 * We strongly prefer these over the robotic system voices.
 * The lang codes Chrome uses vary (es-ES, es-US, es_ES, etc).
 */

const LANG_TO_BCP47: Record<string, string[]> = {
  es: ["es-ES", "es-US", "es_ES", "es"],
  fr: ["fr-FR", "fr_FR", "fr"],
  de: ["de-DE", "de_DE", "de"],
  it: ["it-IT", "it_IT", "it"],
  pt: ["pt-BR", "pt_BR", "pt-PT", "pt"],
  ja: ["ja-JP", "ja_JP", "ja"],
  ko: ["ko-KR", "ko_KR", "ko"],
  zh: ["zh-CN", "zh_CN", "zh-TW", "zh"],
  ru: ["ru-RU", "ru_RU", "ru"],
  nl: ["nl-NL", "nl_NL", "nl"],
};

function matchesLang(voiceLang: string, targetLang: string): boolean {
  const candidates = LANG_TO_BCP47[targetLang] ?? [targetLang];
  const normalized = voiceLang.replace("_", "-").toLowerCase();
  return candidates.some(
    (c) =>
      normalized === c.toLowerCase() ||
      normalized.startsWith(c.toLowerCase() + "-")
  );
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const langVoices = voices.filter((v) => matchesLang(v.lang, lang));

  if (langVoices.length === 0) return null;

  // Strongly prefer Google voices — they're the high-quality natural ones
  const googleVoices = langVoices.filter((v) =>
    v.name.toLowerCase().includes("google")
  );

  if (googleVoices.length > 0) {
    // Log which voice we're using for debugging
    console.log(
      `[TTS] Using Google voice: "${googleVoices[0]!.name}" (${
        googleVoices[0]!.lang
      })`
    );
    return googleVoices[0]!;
  }

  // Fall back to any non-compact, non-Siri voice if no Google voices
  const decentVoices = langVoices.filter(
    (v) =>
      !v.name.toLowerCase().includes("compact") &&
      !v.name.toLowerCase().includes("siri")
  );

  const chosen = decentVoices[0] ?? langVoices[0]!;
  console.log(
    `[TTS] No Google voice found for ${lang}, using: "${chosen.name}" (${chosen.lang})`
  );
  console.log(
    `[TTS] Available voices for ${lang}:`,
    langVoices.map((v) => `${v.name} [${v.lang}]`).join(", ")
  );
  return chosen;
}

export function useTTS(lang: string, enabled: boolean) {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function loadVoices() {
      voiceRef.current = pickVoice(lang);
      setReady(voiceRef.current !== null);
    }

    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [lang]);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !voiceRef.current) return;

      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voiceRef.current;
      utterance.lang = voiceRef.current.lang;
      utterance.rate = 0.9;
      utterance.pitch = 0.95;
      speechSynthesis.speak(utterance);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
  }, []);

  return { speak, stop, ready };
}
