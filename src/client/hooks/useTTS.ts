import { useCallback, useEffect, useRef, useState } from "react";
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

function pickVoice(lang: string): SpeechSynthesisVoice | null {
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
  const targetVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const nativeVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function loadVoices() {
      targetVoiceRef.current = pickVoice(lang);
      nativeVoiceRef.current = pickVoice("en");
      setReady(targetVoiceRef.current !== null);
    }

    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [lang]);

  const speakSegments = useCallback(
    (segments: TextSegment[]) => {
      if (!enabled) return;

      speechSynthesis.cancel();

      for (const seg of segments) {
        const trimmed = seg.text.trim();
        if (!trimmed) continue;

        const voice =
          seg.lang === "nl"
            ? nativeVoiceRef.current
            : seg.lang === "tl"
              ? targetVoiceRef.current
              : targetVoiceRef.current;

        if (!voice) continue;

        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = seg.lang === "tl" ? 0.9 : 1.0;
        utterance.pitch = 0.95;
        speechSynthesis.speak(utterance);
      }
    },
    [enabled]
  );

  const speakText = useCallback(
    (text: string, voiceLang: "tl" | "nl" = "tl") => {
      if (!enabled) return;
      speechSynthesis.cancel();

      const voice =
        voiceLang === "nl"
          ? nativeVoiceRef.current
          : targetVoiceRef.current;
      if (!voice) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = voiceLang === "tl" ? 0.9 : 1.0;
      utterance.pitch = 0.95;
      speechSynthesis.speak(utterance);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
  }, []);

  return { speakSegments, speakText, stop, ready };
}
