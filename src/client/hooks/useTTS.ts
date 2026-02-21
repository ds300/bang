import { useCallback, useEffect, useRef, useState } from "react";

const PREFERRED_VOICE_NAMES: Record<string, string[]> = {
  es: ["Google español", "Jorge", "Diego", "Andrés"],
  fr: ["Google français", "Thomas", "Jacques"],
  de: ["Google Deutsch", "Martin", "Stefan"],
  it: ["Google italiano", "Luca"],
  pt: ["Google português do Brasil", "Luciano"],
  ja: ["Google 日本語", "Otoya"],
  ko: ["Google 한국의", "Yuna"],
  zh: ["Google 普通话（中国大陆）", "Ting-Ting"],
  ru: ["Google русский", "Milena", "Yuri"],
  nl: ["Google Nederlands", "Xander"],
};

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const preferred = PREFERRED_VOICE_NAMES[lang] ?? [];

  // Try preferred voices first
  for (const name of preferred) {
    const match = voices.find(
      (v) => v.name.includes(name) && v.lang.startsWith(lang),
    );
    if (match) return match;
  }

  // Fall back to any voice for the language, preferring male-sounding names
  const langVoices = voices.filter((v) => v.lang.startsWith(lang));
  return langVoices[0] ?? null;
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
      utterance.pitch = 0.9;
      speechSynthesis.speak(utterance);
    },
    [enabled],
  );

  const stop = useCallback(() => {
    speechSynthesis.cancel();
  }, []);

  return { speak, stop, ready };
}
