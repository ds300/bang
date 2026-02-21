import { useState, useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SentenceSpanProps {
  sentence: string;
  lang: string;
  onRequestBreakdown: (sentence: string) => void;
}

export function SentenceSpan({
  sentence,
  lang,
  onRequestBreakdown,
}: SentenceSpanProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);

  async function handleClick() {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentence, lang }),
        });
        const data = await res.json();
        setTranslation(data.translation);
      } catch {
        setTranslation("(translation failed)");
      } finally {
        setLoading(false);
      }
    }
    setOpen(true);
  }

  function handleTooltipClick() {
    setOpen(false);
    onRequestBreakdown(sentence);
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          className="cursor-pointer underline decoration-dotted underline-offset-4 transition-colors hover:decoration-solid"
          onClick={handleClick}
        >
          {sentence}
        </span>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-xs cursor-pointer p-3"
        onClick={handleTooltipClick}
        sideOffset={8}
      >
        {loading ? (
          <span className="text-xs text-muted-foreground">Translating...</span>
        ) : (
          <div className="space-y-1">
            <p className="text-sm">{translation}</p>
            <p className="text-xs text-muted-foreground">
              Click for full breakdown →
            </p>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
