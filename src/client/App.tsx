import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useTheme";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSession } from "@/hooks/useSession";
import { Chat } from "@/components/Chat";

function loadTargetLangMode(): boolean {
  try {
    return localStorage.getItem("bang-target-lang-mode") !== "false";
  } catch {
    return true;
  }
}

export function App() {
  useSystemTheme();
  const { send, addHandler, connected } = useWebSocket();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [targetLangMode, setTargetLangMode] = useState(loadTargetLangMode);

  const session = useSession(send, addHandler, connected, targetLangMode);

  function handleToggleTargetLang() {
    setTargetLangMode((v) => {
      const next = !v;
      localStorage.setItem("bang-target-lang-mode", String(next));
      return next;
    });
  }

  return (
    <TooltipProvider>
      <Chat
        session={session}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        targetLangMode={targetLangMode}
        onToggleTargetLang={handleToggleTargetLang}
      />
      {!connected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-xs text-white shadow-lg">
          Connecting to server...
        </div>
      )}
    </TooltipProvider>
  );
}
