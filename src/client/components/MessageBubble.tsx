import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Volume2, Check, Eye } from "lucide-react";
import { SentenceSpan } from "./SentenceSpan";
import { splitClauses, parseLangTags } from "@/lib/sentences";
import type { TextSegment } from "@/lib/sentences";
import type { ChatMessage } from "@/hooks/useSession";

interface MessageBubbleProps {
  message: ChatMessage;
  lang: string;
  speakSegments?: (segments: TextSegment[]) => void;
  autoPlay?: boolean;
  isLatest?: boolean;
  isCorrect?: boolean;
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

function ListenBlock({
  children,
  speakSegments,
}: {
  children?: React.ReactNode;
  speakSegments?: (segments: TextSegment[]) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  function extractText(node: React.ReactNode): string {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node && typeof node === "object" && "props" in node) {
      const el = node as React.ReactElement<{ children?: React.ReactNode }>;
      return extractText(el.props.children);
    }
    return "";
  }

  function handleReplay() {
    const text = extractText(children);
    if (text && speakSegments) {
      speakSegments([{ text, lang: "tl" }]);
    }
  }

  if (revealed) {
    return <>{children}</>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="select-none blur-sm opacity-50" aria-hidden>
        {children}
      </span>
      <button
        onClick={handleReplay}
        className="inline-flex items-center gap-1 rounded-md bg-muted-foreground/10 px-2 py-0.5 text-xs hover:bg-muted-foreground/20 transition-colors"
        title="Replay audio"
      >
        <Volume2 className="h-3 w-3" />
      </button>
      <button
        onClick={() => setRevealed(true)}
        className="inline-flex items-center gap-1 rounded-md bg-muted-foreground/10 px-2 py-0.5 text-xs hover:bg-muted-foreground/20 transition-colors"
        title="Show text (counts as missed)"
      >
        <Eye className="h-3 w-3" />
        <span>Show</span>
      </button>
    </span>
  );
}

export function MessageBubble({
  message,
  lang,
  speakSegments,
  autoPlay,
  isLatest,
  isCorrect,
  onRequestBreakdown,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasAutoPlayed = useRef(false);

  const segments = !isUser ? parseLangTags(message.text) : [];

  useEffect(() => {
    if (
      !isUser &&
      autoPlay &&
      isLatest &&
      speakSegments &&
      !hasAutoPlayed.current
    ) {
      hasAutoPlayed.current = true;
      speakSegments(segments);
    }
  }, [isUser, autoPlay, isLatest, speakSegments, segments]);

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
                nl: ({ children }: { children?: React.ReactNode }) => (
                  <>{children}</>
                ),
                listen: ({ children }: { children?: React.ReactNode }) => (
                  <ListenBlock speakSegments={speakSegments}>
                    {children}
                  </ListenBlock>
                ),
              } as Record<string, React.ComponentType<{ children?: React.ReactNode }>>}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        )}
        {isCorrect && (
          <div className="absolute -bottom-1 -right-1 rounded-full bg-green-500 p-0.5">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}
        {!isUser && speakSegments && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-9 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => speakSegments(segments)}
            title="Replay audio"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
