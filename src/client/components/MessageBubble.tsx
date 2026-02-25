import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { AudioReplayButton } from "@/components/AudioReplayButton";
import { Check, Eye, Loader2, ExternalLink } from "lucide-react";
import { parseLangTags } from "@/lib/sentences";
import type { TextSegment } from "@/lib/sentences";
import type { ChatMessage } from "@/hooks/useSession";
import type { PlaybackRate } from "@/hooks/useTTS";

interface MessageBubbleProps {
  message: ChatMessage;
  lang: string;
  onboarded: boolean;
  speakSegments?: (segments: TextSegment[], rate?: PlaybackRate, playbackId?: string) => void;
  onStop?: () => void;
  playingId?: string | null;
  autoPlay?: boolean;
  isLatest?: boolean;
  isCorrect?: boolean;
  onRequestBreakdown?: (selection: string, context: string) => void;
}

interface TranslationTooltip {
  x: number;
  y: number;
  selection: string;
  context: string;
  translation: string | null;
  loading: boolean;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/);
}

/** Parse message into segments with raw text so selection works for any structure */
function parseMessageSegments(
  text: string,
  defaultTag: "tl" | "nl"
): Array<{ type: "tl" | "nl" | "listen"; text: string }> {
  const segments: Array<{ type: "tl" | "nl" | "listen"; text: string }> = [];
  const regex = /<(tl|nl|listen)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const gap = text.slice(lastIndex, match.index);
    if (gap.trim()) {
      segments.push({ type: defaultTag, text: gap });
    }
    segments.push({ type: match[1] as "tl" | "nl" | "listen", text: match[2] ?? "" });
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) {
    segments.push({ type: defaultTag, text: tail });
  }

  return segments;
}

function TargetLangBlock({
  rawText,
  lang,
  onRequestBreakdown,
}: {
  rawText: string;
  lang: string;
  onRequestBreakdown?: (selection: string, context: string) => void;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TranslationTooltip | null>(null);
  const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const selectionRef = useRef<[number, number] | null>(null);

  const fullText = rawText;
  const tokens = tokenize(fullText);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  function getWordIdxFromTarget(target: EventTarget | null): number | null {
    if (!(target instanceof HTMLElement)) return null;
    const idx = target.dataset?.wordIdx;
    return idx != null ? parseInt(idx, 10) : null;
  }

  function getSelectedText(start: number, end: number): string {
    const t = tokensRef.current;
    let wordCount = -1;
    const parts: string[] = [];
    for (const token of t) {
      if (token.trim()) {
        wordCount++;
        if (wordCount >= start && wordCount <= end) {
          parts.push(token);
        } else if (parts.length > 0 && wordCount > end) {
          break;
        }
      } else if (wordCount >= start && wordCount <= end) {
        parts.push(token);
      }
    }
    return parts.join("").trim();
  }

  function showTooltipForSelection(start: number, end: number) {
    const selectedText = getSelectedText(start, end);
    if (!selectedText || !containerRef.current) return;

    const wordEls = containerRef.current.querySelectorAll("[data-word-idx]");
    const firstEl = wordEls[start] as HTMLElement | undefined;
    const lastEl = wordEls[end] as HTMLElement | undefined;
    if (!firstEl || !lastEl) return;

    const firstRect = firstEl.getBoundingClientRect();
    const lastRect = lastEl.getBoundingClientRect();
    const x = (firstRect.left + lastRect.right) / 2;
    const y = Math.min(firstRect.top, lastRect.top);

    setTooltip({
      x,
      y,
      selection: selectedText,
      context: fullText,
      translation: null,
      loading: true,
    });

    apiFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: selectedText, lang, context: fullText }),
    })
      .then((r) => r.json())
      .then((data) => {
        setTooltip((prev) =>
          prev ? { ...prev, translation: data.translation, loading: false } : null
        );
      })
      .catch(() => {
        setTooltip((prev) =>
          prev ? { ...prev, translation: "(translation failed)", loading: false } : null
        );
      });
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const idx = getWordIdxFromTarget(e.target);
    if (idx == null) return;

    setTooltip(null);
    dragStartRef.current = idx;
    selectionRef.current = [idx, idx];
    setSelectedRange([idx, idx]);
    e.preventDefault();
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragStartRef.current == null) return;
    const idx = getWordIdxFromTarget(e.target);
    if (idx == null) return;

    const start = Math.min(dragStartRef.current, idx);
    const end = Math.max(dragStartRef.current, idx);
    selectionRef.current = [start, end];
    setSelectedRange([start, end]);
  }

  function handleMouseUp() {
    if (dragStartRef.current == null || !selectionRef.current) return;
    const [start, end] = selectionRef.current;
    dragStartRef.current = null;
    showTooltipForSelection(start, end);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) {
        setTooltip(null);
        setSelectedRange(null);
      }
    }
    if (tooltip) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [tooltip]);

  function handleTooltipClick() {
    if (!tooltip || !onRequestBreakdown) return;
    onRequestBreakdown(tooltip.selection, tooltip.context);
    setTooltip(null);
    setSelectedRange(null);
  }

  let wordIdx = -1;
  return (
    <>
      <span
        ref={containerRef}
        className="tl-block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {tokens.map((token, i) => {
          if (!token.trim()) {
            return <span key={i}>{token}</span>;
          }
          wordIdx++;
          const idx = wordIdx;
          const isSelected = selectedRange && idx >= selectedRange[0] && idx <= selectedRange[1];
          return (
            <span
              key={i}
              data-word-idx={idx}
              className={cn(
                "tl-word",
                isSelected && "tl-word-selected"
              )}
            >
              {token}
            </span>
          );
        })}
      </span>
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] rounded-lg border bg-popover px-3 py-2 shadow-md cursor-pointer"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
          onClick={handleTooltipClick}
        >
          {tooltip.loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Translating...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-sm">{tooltip.translation}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
          )}
        </div>
      )}
    </>
  );
}

function ListenBlock({
  children,
  speakSegments,
  onStop,
  playingId,
  playbackId,
}: {
  children?: React.ReactNode;
  speakSegments?: (segments: TextSegment[], rate?: PlaybackRate, playbackId?: string) => void;
  onStop?: () => void;
  playingId?: string | null;
  playbackId: string;
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

  const text = extractText(children);
  const segments = text ? [{ text, lang: "tl" as const }] : [];

  if (revealed) {
    return <>{children}</>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="select-none blur-sm opacity-50" aria-hidden>
        {children}
      </span>
      {speakSegments && (
        <AudioReplayButton
          onReplay={(rate) => speakSegments(segments, rate, playbackId)}
          onStop={onStop}
          isPlaying={playingId === playbackId}
          className="inline-flex h-auto gap-1 rounded-md bg-muted-foreground/10 px-2 py-0.5 text-xs hover:bg-muted-foreground/20"
          size="sm"
          iconClassName="h-3 w-3"
        />
      )}
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
  onboarded,
  speakSegments,
  onStop,
  playingId,
  autoPlay,
  isLatest,
  isCorrect,
  onRequestBreakdown,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasAutoPlayed = useRef(false);

  const defaultLang: "tl" | "nl" = onboarded ? "tl" : "nl";
  const segmentsForTTS = !isUser ? parseLangTags(message.text, defaultLang) : [];
  const segmentsForRender =
    !isUser ? parseMessageSegments(message.text, defaultLang) : [];

  useEffect(() => {
    if (
      !isUser &&
      autoPlay &&
      isLatest &&
      speakSegments &&
      !hasAutoPlayed.current
    ) {
      hasAutoPlayed.current = true;
      speakSegments(segmentsForTTS, 1, message.id);
    }
  }, [isUser, autoPlay, isLatest, speakSegments, segmentsForTTS, message.id]);

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
            {segmentsForRender.map((seg, i) => {
              if (seg.type === "tl") {
                return (
                  <TargetLangBlock
                    key={i}
                    rawText={seg.text}
                    lang={lang}
                    onRequestBreakdown={onRequestBreakdown}
                  />
                );
              }
              if (seg.type === "listen") {
                return (
                  <ListenBlock
                    key={i}
                    speakSegments={speakSegments}
                    onStop={onStop}
                    playingId={playingId}
                    playbackId={`${message.id}-listen-${i}`}
                  >
                    {seg.text}
                  </ListenBlock>
                );
              }
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {seg.text}
                </span>
              );
            })}
          </div>
        )}
        {isCorrect && (
          <div className="absolute -bottom-1 -right-1 rounded-full bg-green-500 p-0.5">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}
        {!isUser && speakSegments && (
          <div className="absolute -right-9 top-1 opacity-0 transition-opacity group-hover:opacity-100">
            <AudioReplayButton
              onReplay={(rate) => speakSegments(segmentsForTTS, rate, message.id)}
              onStop={onStop}
              isPlaying={playingId === message.id}
              className="h-7 w-7"
            />
          </div>
        )}
      </div>
    </div>
  );
}
