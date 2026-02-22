import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
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
import {
  Volume2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Send,
} from "lucide-react";

interface ConversationEntry {
  role: "user" | "assistant";
  text: string;
}

interface BreakdownDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sentence: string | null;
  lang: string;
  speak?: (text: string) => void;
}

export function BreakdownDrawer({
  open,
  onOpenChange,
  sentence,
  lang,
  speak,
}: BreakdownDrawerProps) {
  const [breakdown, setBreakdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [learnableItems, setLearnableItems] = useState<
    Array<{ concept: string; type: string }>
  >([]);

  const fetchBreakdown = useCallback(async () => {
    if (!sentence) return;
    setLoading(true);
    setBreakdown(null);
    setConversation([]);
    setLearnableItems([]);

    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence, lang }),
      });
      const data = await res.json();
      setBreakdown(data.breakdown);

      // Extract learnable items from JSON code blocks
      const jsonMatch = data.breakdown.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch?.[1]) {
        try {
          const items = JSON.parse(jsonMatch[1]);
          setLearnableItems(items);
        } catch {
          // ignore parse errors
        }
      }
    } catch {
      setBreakdown("Failed to load breakdown.");
    } finally {
      setLoading(false);
    }
  }, [sentence, lang]);

  useEffect(() => {
    if (open && sentence) {
      fetchBreakdown();
    }
  }, [open, sentence, fetchBreakdown]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !sentence) return;

    const q = question.trim();
    setQuestion("");
    setConversation((prev) => [...prev, { role: "user", text: q }]);
    setAskingQuestion(true);

    try {
      const res = await fetch("/api/breakdown/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence,
          lang,
          question: q,
          context: breakdown,
        }),
      });
      const data = await res.json();
      setConversation((prev) => [
        ...prev,
        { role: "assistant", text: data.answer },
      ]);
    } catch {
      setConversation((prev) => [
        ...prev,
        { role: "assistant", text: "Failed to get answer." },
      ]);
    } finally {
      setAskingQuestion(false);
    }
  }

  // Strip JSON block from display
  const displayBreakdown = breakdown
    ?.replace(/```json\s*\n[\s\S]*?\n```/, "")
    .trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-left text-base">
            Sentence Breakdown
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 px-4 pb-4">
            {/* Original sentence with replay */}
            {sentence && (
              <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
                <p className="flex-1 text-sm font-medium italic">{sentence}</p>
                {speak && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => speak(sentence)}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analyzing...</span>
              </div>
            )}

            {/* Breakdown content */}
            {displayBreakdown && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{displayBreakdown!}</ReactMarkdown>
              </div>
            )}

            {/* Learnable items */}
            {learnableItems.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Add to learning queue
                  </h4>
                  {learnableItems.map((item) => (
                    <div
                      key={item.concept}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div>
                        <span className="text-sm">{item.concept}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.type}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          title="Learn next (add to front of queue)"
                        >
                          <ArrowUpRight className="mr-1 h-3 w-3" />
                          Next
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          title="Learn later (add to end of queue)"
                        >
                          <ArrowDownRight className="mr-1 h-3 w-3" />
                          Later
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Conversation thread */}
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
                      {entry.text}
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

        {/* Question input */}
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
