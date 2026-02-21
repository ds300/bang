import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import { SentenceSpan } from "./SentenceSpan";
import { splitClauses, looksLikeTargetLanguage } from "@/lib/sentences";
import type { ChatMessage } from "@/hooks/useSession";

interface MessageBubbleProps {
  message: ChatMessage;
  lang: string;
  speak?: (text: string) => void;
  autoPlay?: boolean;
  isLatest?: boolean;
  onRequestBreakdown?: (sentence: string) => void;
}

function ClickableText({
  text,
  lang,
  onRequestBreakdown,
}: {
  text: string;
  lang: string;
  onRequestBreakdown: (sentence: string) => void;
}) {
  const clauses = splitClauses(text);
  return (
    <>
      {clauses.map((clause, i) => {
        const isTarget = looksLikeTargetLanguage(clause);
        if (isTarget) {
          return (
            <span key={i}>
              <SentenceSpan
                sentence={clause}
                lang={lang}
                onRequestBreakdown={onRequestBreakdown}
              />
              {i < clauses.length - 1 ? " " : ""}
            </span>
          );
        }
        return (
          <span key={i}>
            {clause}
            {i < clauses.length - 1 ? " " : ""}
          </span>
        );
      })}
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

  useEffect(() => {
    if (!isUser && autoPlay && isLatest && speak && !hasAutoPlayed.current) {
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
          "group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.text}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              components={
                onRequestBreakdown
                  ? {
                      p: ({ children }) => (
                        <p>
                          {processChildren(children, lang, onRequestBreakdown)}
                        </p>
                      ),
                      li: ({ children }) => (
                        <li>
                          {processChildren(children, lang, onRequestBreakdown)}
                        </li>
                      ),
                    }
                  : undefined
              }
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

function processChildren(
  children: React.ReactNode,
  lang: string,
  onRequestBreakdown: (sentence: string) => void
): React.ReactNode {
  if (!children) return children;
  if (typeof children === "string") {
    return (
      <ClickableText
        text={children}
        lang={lang}
        onRequestBreakdown={onRequestBreakdown}
      />
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return (
          <ClickableText
            key={i}
            text={child}
            lang={lang}
            onRequestBreakdown={onRequestBreakdown}
          />
        );
      }
      return child;
    });
  }
  return children;
}
