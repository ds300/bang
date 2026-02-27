import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Send } from "lucide-react";
import { AudioReplayButton } from "@/components/AudioReplayButton";
import type { PlaybackRate } from "@/hooks/useTTS";

interface ConversationEntry {
  role: "user" | "assistant";
  text: string;
}

interface BreakdownDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sentence: string | null;
  context?: string | null;
  lang: string;
  speakText?: (
    text: string,
    voiceLang?: "tl" | "nl",
    rate?: PlaybackRate,
    playbackId?: string
  ) => void;
  onStop?: () => void;
  playingId?: string | null;
}

async function readSSEStream(
  response: Response,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return fullText;
        try {
          const data = JSON.parse(payload);
          if (data.error) throw new Error(data.error);
          if (data.text) {
            fullText += data.text;
            onChunk(data.text);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return fullText;
}

export function BreakdownDrawer({
  open,
  onOpenChange,
  sentence,
  context,
  lang,
  speakText,
  onStop,
  playingId,
}: BreakdownDrawerProps) {
  const [breakdown, setBreakdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBreakdown = useCallback(async () => {
    if (!sentence) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setBreakdown("");
    setConversation([]);

    try {
      const res = await apiFetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence,
          lang,
          context: context ?? undefined,
        }),
        signal: controller.signal,
      });

      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        await readSSEStream(
          res,
          (chunk) => setBreakdown((prev) => prev + chunk),
          controller.signal
        );
      } else {
        const data = await res.json();
        setBreakdown(data.breakdown);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setBreakdown("Failed to load breakdown.");
      }
    } finally {
      setLoading(false);
    }
  }, [sentence, lang, context]);

  useEffect(() => {
    if (open && sentence) {
      fetchBreakdown();
    }
    return () => abortRef.current?.abort();
  }, [open, sentence, fetchBreakdown]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !sentence) return;

    const q = question.trim();
    setQuestion("");
    setConversation((prev) => [...prev, { role: "user", text: q }]);
    setAskingQuestion(true);

    const controller = new AbortController();

    try {
      const res = await apiFetch("/api/breakdown/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence,
          lang,
          question: q,
          context: breakdown,
        }),
        signal: controller.signal,
      });

      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        setConversation((prev) => [...prev, { role: "assistant", text: "" }]);
        await readSSEStream(
          res,
          (chunk) =>
            setConversation((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  text: last.text + chunk,
                };
              }
              return updated;
            }),
          controller.signal
        );
      } else {
        const data = await res.json();
        setConversation((prev) => [
          ...prev,
          { role: "assistant", text: data.answer },
        ]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setConversation((prev) => [
          ...prev,
          { role: "assistant", text: "Failed to get answer." },
        ]);
      }
    } finally {
      setAskingQuestion(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left text-base">
            {sentence && speakText && (
              <AudioReplayButton
                onReplay={(rate) =>
                  speakText(sentence!, "tl", rate, `breakdown-${sentence}`)
                }
                onStop={onStop}
                isPlaying={playingId === `breakdown-${sentence}`}
                className="h-7 w-7 shrink-0"
              />
            )}
            <span className="italic">{sentence}</span>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 px-4 pb-4">

            {loading && !breakdown && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analyzing...</span>
              </div>
            )}

            {breakdown && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{breakdown}</ReactMarkdown>
              </div>
            )}

            {conversation.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  {conversation.map((entry, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        entry.role === "user"
                          ? "bg-primary text-primary-foreground ml-4"
                          : "bg-muted mr-4"
                      }`}
                    >
                      {entry.role === "assistant" ? (
                        <ReactMarkdown>{entry.text}</ReactMarkdown>
                      ) : (
                        entry.text
                      )}
                    </div>
                  ))}
                  {askingQuestion && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <form onSubmit={handleAsk} className="flex gap-2 border-t px-4 py-3">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this sentence..."
            className="text-sm"
            disabled={loading || askingQuestion}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!question.trim() || loading || askingQuestion}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
