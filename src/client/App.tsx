import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useTheme";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSession } from "@/hooks/useSession";
import { Chat } from "@/components/Chat";

export function App() {
  useSystemTheme();
  const { send, addHandler, connected } = useWebSocket();
  const session = useSession(send, addHandler);
  const [audioEnabled, setAudioEnabled] = useState(true);

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
    </TooltipProvider>
  );
}
