import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { LanguagePicker } from "./LanguagePicker";
import { BreakdownDrawer } from "./BreakdownDrawer";
import { Loader2, Volume2, VolumeOff } from "lucide-react";
import { useTTS } from "@/hooks/useTTS";
import type { useSession } from "@/hooks/useSession";

type SessionState = ReturnType<typeof useSession>;

export interface ViewOnlySession {
  messages: { id: string; role: "user" | "assistant"; text: string }[];
  started_at: string;
  lang: string;
}

interface ChatProps {
  session: SessionState;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  viewOnly?: ViewOnlySession | null;
  /** When set (e.g. when viewing a past session), used instead of session.sendChat so the parent can resume then send */
  onSend?: (text: string) => void;
}

const NEAR_BOTTOM_THRESHOLD = 80;

export function Chat({ session, audioEnabled, onToggleAudio, viewOnly = null, onSend }: ChatProps) {
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLElement | null>(null);
  const isNearBottom = useRef(true);
  const lang = viewOnly?.lang ?? session.lang;
  const { speakSegments, speakText, stop, playingId } = useTTS(lang, audioEnabled);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [breakdownSentence, setBreakdownSentence] = useState<string | null>(
    null,
  );
  const [breakdownContext, setBreakdownContext] = useState<string | null>(null);

  const handleLangSelect = useCallback(
    async (newLang: string) => {
      const res = await apiFetch(`/api/lang-profile?lang=${encodeURIComponent(newLang)}`);
      const data = (await res.json()) as { onboarded?: boolean };
      if (data.onboarded) {
        session.setLang(newLang);
      } else {
        navigate(`/onboard/${newLang}`);
      }
    },
    [session, navigate],
  );

  const messages = viewOnly?.messages ?? session.messages;
  const isViewingPast = !!viewOnly;

  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const vp = node.querySelector("[data-slot='scroll-area-viewport']");
    if (vp instanceof HTMLElement) {
      viewportRef.current = vp;
      vp.addEventListener("scroll", () => {
        isNearBottom.current =
          vp.scrollHeight - vp.scrollTop - vp.clientHeight <
          NEAR_BOTTOM_THRESHOLD;
      });
    }
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (vp && isNearBottom.current) {
      vp.scrollTop = vp.scrollHeight;
    }
  }, [messages, session.agentThinking]);

  useEffect(() => {
    if (!audioEnabled) stop();
  }, [audioEnabled, stop]);

  const handleRequestBreakdown = useCallback(
    (selection: string, context: string) => {
      setBreakdownSentence(selection);
      setBreakdownContext(context);
      setDrawerOpen(true);
    },
    [],
  );

  const showWelcome = !isViewingPast && !session.sessionActive && messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <LanguagePicker
              currentLang={lang}
              onSelect={handleLangSelect}
              disabled={session.sessionActive || isViewingPast}
            />
            {isViewingPast && (
              <span className="text-sm text-muted-foreground">
                Continue session
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
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

            {messages.map((msg, i) => {
              const nextMsg = messages[i + 1];
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
                    lang={lang}
                    onboarded={session.onboarded}
                    speakSegments={speakSegments}
                    onStop={stop}
                    playingId={playingId}
                    autoPlay={audioEnabled && !session.restored && !isViewingPast}
                    isLatest={i === messages.length - 1}
                    isCorrect={false}
                    onRequestBreakdown={handleRequestBreakdown}
                  />
                );
              }

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  lang={lang}
                  onboarded={session.onboarded}
                  speakSegments={speakSegments}
                  onStop={stop}
                  playingId={playingId}
                  autoPlay={audioEnabled && !session.restored && !isViewingPast}
                  isLatest={i === messages.length - 1}
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

      {/* Input — always shown so user can continue any session */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            onSend={onSend ?? session.sendChat}
            disabled={session.agentThinking}
            shouldFocus={
              (session.sessionActive || isViewingPast) && !session.agentThinking
            }
            userMessageHistory={messages
              .filter((m) => m.role === "user")
              .map((m) => m.text)
              .reverse()}
            placeholder={
              session.agentThinking
                ? "Waiting for response..."
                : isViewingPast
                  ? "Continue this session..."
                  : !session.sessionActive
                    ? messages.length > 0
                      ? "Session ended — type to continue or press + for new session"
                      : "Press + to start a session"
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
        context={breakdownContext}
        lang={lang}
        speakText={speakText}
        onStop={stop}
        playingId={playingId}
      />
    </div>
  );
}
