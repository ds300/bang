import { useCallback, useEffect, useState } from "react";
import type { TextSegment } from "@/lib/sentences";

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
  en: ["en-GB", "en-US", "en_GB", "en_US", "en"],
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

// Chrome's Google TTS voices have a bug where lowercase words containing
// accented characters get spelled out letter by letter. Capitalizing the
// first letter of such words works around it without affecting pronunciation.
function fixAccentBug(text: string): string {
  return text.replace(
    /\b([a-záéíóúñü]*[áéíóúñü][a-záéíóúñü]*)/gi,
    (word) => word.charAt(0).toUpperCase() + word.slice(1)
  );
}

function pickVoiceFresh(lang: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const langVoices = voices.filter((v) => matchesLang(v.lang, lang));

  if (langVoices.length === 0) return null;

  const googleVoices = langVoices.filter((v) =>
    v.name.toLowerCase().includes("google")
  );
  if (googleVoices.length > 0) return googleVoices[0]!;

  const decentVoices = langVoices.filter(
    (v) =>
      !v.name.toLowerCase().includes("compact") &&
      !v.name.toLowerCase().includes("siri")
  );
  return decentVoices[0] ?? langVoices[0]!;
}

export function useTTS(lang: string, enabled: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function checkReady() {
      setReady(pickVoiceFresh(lang) !== null);
    }
    checkReady();
    speechSynthesis.addEventListener("voiceschanged", checkReady);
    return () =>
      speechSynthesis.removeEventListener("voiceschanged", checkReady);
  }, [lang]);

  const speakSegments = useCallback(
    (segments: TextSegment[]) => {
      if (!enabled) return;

      speechSynthesis.cancel();

      for (const seg of segments) {
        const trimmed = seg.text.trim();
        if (!trimmed) continue;

        const voiceLang = seg.lang === "nl" ? "en" : lang;
        const voice = pickVoiceFresh(voiceLang);
        if (!voice) continue;

        const normalized = fixAccentBug(trimmed.normalize("NFC"));
        console.log("yosef", normalized);
        const utterance = new SpeechSynthesisUtterance(normalized);
        utterance.voice = voice;
        utterance.rate = seg.lang === "tl" ? 0.92 : 1.0;
        speechSynthesis.speak(utterance);
      }
    },
    [enabled, lang]
  );

  const speakText = useCallback(
    (text: string, voiceLang: "tl" | "nl" = "tl") => {
      if (!enabled) return;
      speechSynthesis.cancel();

      const voice = pickVoiceFresh(voiceLang === "nl" ? "en" : lang);
      if (!voice) return;

      const utterance = new SpeechSynthesisUtterance(
        fixAccentBug(text.normalize("NFC"))
      );
      utterance.voice = voice;
      utterance.rate = voiceLang === "tl" ? 0.92 : 1.0;
      speechSynthesis.speak(utterance);
    },
    [enabled, lang]
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
  }, []);

  return { speakSegments, speakText, stop, ready };
}
