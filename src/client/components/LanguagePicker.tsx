import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "ru", name: "Русский" },
  { code: "nl", name: "Nederlands" },
] as const;

interface LanguagePickerProps {
  currentLang: string;
  onSelect: (lang: string) => void;
  disabled?: boolean;
}

export function LanguagePicker({
  currentLang,
  onSelect,
  disabled,
}: LanguagePickerProps) {
  const current = LANGUAGES.find((l) => l.code === currentLang);

  return (
    <div className="relative">
      <select
        value={currentLang}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer appearance-none rounded-md border-0 px-3 py-1.5 pr-8 text-sm font-medium focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
