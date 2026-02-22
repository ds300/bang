import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { LanguagePicker } from "./LanguagePicker";
import { SessionControls } from "./SessionControls";
import { BreakdownDrawer } from "./BreakdownDrawer";
import { Loader2, Volume2, VolumeOff, Languages, MessageSquareText } from "lucide-react";
import { useTTS } from "@/hooks/useTTS";
import type { useSession } from "@/hooks/useSession";

type SessionState = ReturnType<typeof useSession>;

interface ChatProps {
  session: SessionState;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  targetLangMode: boolean;
  onToggleTargetLang: () => void;
}

const NEAR_BOTTOM_THRESHOLD = 80;

export function Chat({ session, audioEnabled, onToggleAudio, targetLangMode, onToggleTargetLang }: ChatProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const isNearBottom = useRef(true);
  const { speakSegments, speakText, stop } = useTTS(session.lang, audioEnabled);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [breakdownSentence, setBreakdownSentence] = useState<string | null>(
    null
  );

  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const vp = node.querySelector("[data-slot='scroll-area-viewport']");
    if (vp instanceof HTMLElement) {
      viewportRef.current = vp;
      vp.addEventListener("scroll", () => {
        isNearBottom.current =
          vp.scrollHeight - vp.scrollTop - vp.clientHeight < NEAR_BOTTOM_THRESHOLD;
      });
    }
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (vp && isNearBottom.current) {
      vp.scrollTop = vp.scrollHeight;
    }
  }, [session.messages, session.agentThinking]);

  useEffect(() => {
    if (!audioEnabled) stop();
  }, [audioEnabled, stop]);

  const handleRequestBreakdown = useCallback((sentence: string) => {
    setBreakdownSentence(sentence);
    setDrawerOpen(true);
  }, []);

  const showWelcome = !session.sessionActive && session.messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Bang</h1>
            <LanguagePicker
              currentLang={session.lang}
              onSelect={session.setLang}
              disabled={session.sessionActive}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTargetLang}
              title={targetLangMode ? "Agent speaks target language (click for English)" : "Agent speaks English (click for target language)"}
            >
              {targetLangMode ? (
                <Languages className="h-4 w-4" />
              ) : (
                <MessageSquareText className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleAudio}
              title={audioEnabled ? "Mute audio" : "Enable audio"}
            >
              {audioEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeOff className="h-4 w-4" />
              )}
            </Button>
            <SessionControls
              sessionActive={session.sessionActive}
              onStartSession={session.startSession}
              onEndSession={session.endSession}
            />
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollAreaRef}>
          <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
            {showWelcome && (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <h2 className="text-xl font-semibold">Ready to learn?</h2>
                <p className="text-sm text-muted-foreground">
                  Click the{" "}
                  <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono">
                    +
                  </kbd>{" "}
                  button to start a new session.
                </p>
              </div>
            )}

            {session.messages.map((msg, i) => {
              const nextMsg = session.messages[i + 1];
              const isUser = msg.role === "user";

              const nextStartsWithTick =
                nextMsg?.role === "assistant" &&
                nextMsg.text.trimStart().startsWith("✓");

              const markedCorrect = isUser && nextStartsWithTick;

              if (!isUser && msg.text.trimStart().startsWith("✓")) {
                const rest = msg.text.trimStart().replace(/^✓\s*/, "").trim();
                if (!rest) return null;

                return (
                  <MessageBubble
                    key={msg.id}
                    message={{ ...msg, text: rest }}
                    lang={session.lang}
                    speakSegments={speakSegments}
                    autoPlay={audioEnabled}
                    isLatest={i === session.messages.length - 1}
                    isCorrect={false}
                    onRequestBreakdown={handleRequestBreakdown}
                  />
                );
              }

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  lang={session.lang}
                  speakSegments={speakSegments}
                  autoPlay={audioEnabled}
                  isLatest={i === session.messages.length - 1}
                  isCorrect={markedCorrect}
                  onRequestBreakdown={handleRequestBreakdown}
                />
              );
            })}

            {session.agentThinking && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            onSend={session.sendChat}
            disabled={!session.sessionActive || session.agentThinking}
            shouldFocus={session.sessionActive && !session.agentThinking}
            placeholder={
              !session.sessionActive
                ? session.messages.length > 0
                  ? "Session ended — press + to continue"
                  : "Press + to start a session"
                : session.agentThinking
                ? "Waiting for response..."
                : "Type a message..."
            }
          />
        </div>
      </div>

      {/* Breakdown Drawer */}
      <BreakdownDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        sentence={breakdownSentence}
        lang={session.lang}
        speakText={speakText}
      />
    </div>
  );
}
