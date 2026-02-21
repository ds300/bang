import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { SentenceSpan } from "./SentenceSpan";
import { splitSentences, looksLikeTargetLanguage } from "@/lib/sentences";
import type { ChatMessage } from "@/hooks/useSession";

interface MessageBubbleProps {
  message: ChatMessage;
  lang: string;
  speak?: (text: string) => void;
  autoPlay?: boolean;
  isLatest?: boolean;
  onRequestBreakdown?: (sentence: string) => void;
}

export function MessageBubble({
  message,
  lang,
  speak,
  autoPlay,
  isLatest,
  onRequestBreakdown,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasAutoPlayed = useRef(false);

  useEffect(() => {
    if (
      !isUser &&
      autoPlay &&
      isLatest &&
      speak &&
      !hasAutoPlayed.current
    ) {
      hasAutoPlayed.current = true;
      speak(message.text);
    }
  }, [isUser, autoPlay, isLatest, speak, message.text]);

  const sentences = isUser ? null : splitSentences(message.text);

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {isUser || !sentences || !onRequestBreakdown ? (
          <span className="whitespace-pre-wrap">{message.text}</span>
        ) : (
          <span>
            {sentences.map((sentence, i) => {
              const isTarget = looksLikeTargetLanguage(sentence);
              if (isTarget) {
                return (
                  <span key={i}>
                    <SentenceSpan
                      sentence={sentence}
                      lang={lang}
                      onRequestBreakdown={onRequestBreakdown}
                    />
                    {i < sentences.length - 1 ? " " : ""}
                  </span>
                );
              }
              return (
                <span key={i}>
                  {sentence}
                  {i < sentences.length - 1 ? " " : ""}
                </span>
              );
            })}
          </span>
        )}
        {!isUser && speak && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-9 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => speak(message.text)}
            title="Replay audio"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
