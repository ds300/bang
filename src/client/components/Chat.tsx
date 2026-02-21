import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { ExerciseCard } from "./ExerciseCard";
import { OptionsCard } from "./OptionsCard";
import { ChatInput } from "./ChatInput";
import { LanguagePicker } from "./LanguagePicker";
import { Loader2, Plus, Volume2, VolumeOff } from "lucide-react";
import type { useSession } from "@/hooks/useSession";

type SessionState = ReturnType<typeof useSession>;

interface ChatProps {
  session: SessionState;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}

export function Chat({ session, audioEnabled, onToggleAudio }: ChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages, session.pendingExercise, session.pendingOptions]);

  const showWelcome =
    !session.sessionActive && session.messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Bang</h1>
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
              onClick={onToggleAudio}
              title={audioEnabled ? "Mute audio" : "Enable audio"}
            >
              {audioEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (session.sessionActive) {
                  session.endSession(false);
                } else {
                  session.startSession();
                }
              }}
              title={session.sessionActive ? "End session" : "New session"}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
            {showWelcome && (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <h2 className="text-xl font-semibold">
                  Ready to learn?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Click the + button to start a new session.
                </p>
              </div>
            )}

            {session.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {session.pendingOptions && (
              <OptionsCard
                pending={session.pendingOptions}
                onSelect={session.selectOption}
              />
            )}

            {session.pendingExercise && (
              <ExerciseCard
                pending={session.pendingExercise}
                onSubmit={session.respondToExercise}
              />
            )}

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
            disabled={
              !session.sessionActive ||
              session.agentThinking ||
              !!session.pendingExercise
            }
            placeholder={
              !session.sessionActive
                ? "Start a session to begin..."
                : session.agentThinking
                  ? "Waiting for response..."
                  : "Type a message..."
            }
          />
        </div>
      </div>
    </div>
  );
}
