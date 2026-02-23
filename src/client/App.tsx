import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSession } from "@/hooks/useSession";
import { Chat } from "@/components/Chat";
import { AuthScreen } from "@/components/AuthScreen";
import { DebugPanel } from "@/components/DebugPanel";

export function App() {
  useSystemTheme();
  const auth = useAuth();
  const { send, addHandler, connected } = useWebSocket(auth.token);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);

  const session = useSession(send, addHandler, connected);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setDebugOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!auth.isAuthenticated) {
    return (
      <AuthScreen
        onLogin={auth.login}
        onSignup={auth.signup}
        loading={auth.loading}
      />
    );
  }

  return (
    <TooltipProvider>
      <Chat
        session={session}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
      />
      {!connected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-xs text-white shadow-lg">
          Connecting to server...
        </div>
      )}
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </TooltipProvider>
  );
}
