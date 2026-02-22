import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { SentenceSpan } from "./SentenceSpan";
import { splitClauses, stripTargetLangTags } from "@/lib/sentences";
import type { ChatMessage } from "@/hooks/useSession";

interface MessageBubbleProps {
  message: ChatMessage;
  lang: string;
  speak?: (text: string) => void;
  autoPlay?: boolean;
  isLatest?: boolean;
  onRequestBreakdown?: (sentence: string) => void;
}

function TargetLangText({
  children,
  lang,
  onRequestBreakdown,
}: {
  children: React.ReactNode;
  lang: string;
  onRequestBreakdown: (sentence: string) => void;
}) {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children
            .map((c) => (typeof c === "string" ? c : ""))
            .join("")
        : "";

  if (!text) return <>{children}</>;

  const clauses = splitClauses(text);
  return (
    <>
      {clauses.map((clause, i) => (
        <span key={i}>
          <SentenceSpan
            sentence={clause}
            lang={lang}
            onRequestBreakdown={onRequestBreakdown}
          />
          {i < clauses.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
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

  const plainText = isUser ? message.text : stripTargetLangTags(message.text);

  useEffect(() => {
    if (!isUser && autoPlay && isLatest && speak && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      speak(plainText);
    }
  }, [isUser, autoPlay, isLatest, speak, plainText]);

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
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.text}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
              components={{
                tl: ({ children }: { children?: React.ReactNode }) =>
                  onRequestBreakdown ? (
                    <TargetLangText
                      lang={lang}
                      onRequestBreakdown={onRequestBreakdown}
                    >
                      {children}
                    </TargetLangText>
                  ) : (
                    <>{children}</>
                  ),
              }}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && speak && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-9 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => speak(plainText)}
            title="Replay audio"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
