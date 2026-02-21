import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import type { ChatMessage } from "@/hooks/useSession";

interface MessageBubbleProps {
  message: ChatMessage;
  speak?: (text: string) => void;
  autoPlay?: boolean;
  isLatest?: boolean;
}

export function MessageBubble({
  message,
  speak,
  autoPlay,
  isLatest,
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

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {message.text}
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
