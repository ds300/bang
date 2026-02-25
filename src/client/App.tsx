import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSession } from "@/hooks/useSession";
import { Chat } from "@/components/Chat";
import { Navbar } from "@/components/Navbar";
import { AuthScreen } from "@/components/AuthScreen";
import { DebugPanel } from "@/components/DebugPanel";
import { PromptTestPage } from "@/components/PromptTestPage";
import { apiFetch } from "@/lib/api";

function MainView() {
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { send, addHandler, connected } = useWebSocket(auth.token);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);

  const session = useSession(send, addHandler, connected);
  const selectedSessionId = routeSessionId ?? null;
  const lastNavigatedSessionIdRef = useRef<string | null>(null);

  const [sessionCache, setSessionCache] = useState<
    Record<string, { messages: { id: string; role: "user" | "assistant"; text: string }[]; started_at: string; lang: string }>
  >({});

  const loadSessionMessages = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/sessions/${id}/messages`);
      const data = await res.json();
      if (data.messages && data.session) {
        setSessionCache((prev) => ({
          ...prev,
          [id]: {
            messages: data.messages,
            started_at: data.session.started_at,
            lang: data.session.lang ?? "es",
          },
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (
      selectedSessionId &&
      selectedSessionId !== session.sessionId &&
      !sessionCache[selectedSessionId]
    ) {
      loadSessionMessages(selectedSessionId);
    }
  }, [selectedSessionId, session.sessionId, sessionCache, loadSessionMessages]);

  const viewOnly =
    selectedSessionId && selectedSessionId !== session.sessionId
      ? sessionCache[selectedSessionId] ?? null
      : null;

  const handleSelectSession = useCallback(
    (id: string | null) => {
      navigate(id ? `/session/${id}` : "/");
    },
    [navigate],
  );

  // When the active session id changes (e.g. user started a new session), always
  // navigate to it so the URL and view stay in sync. Don't navigate when the user
  // has explicitly chosen to view a different (past) session.
  useEffect(() => {
    if (!session.sessionActive || !session.sessionId) {
      lastNavigatedSessionIdRef.current = null;
      return;
    }
    const sessionIdChanged =
      lastNavigatedSessionIdRef.current !== session.sessionId;
    if (sessionIdChanged) {
      lastNavigatedSessionIdRef.current = session.sessionId;
      navigate(`/session/${session.sessionId}`, { replace: true });
    }
  }, [session.sessionActive, session.sessionId, navigate]);

  // When we're on a session URL (including a past session), mark current session
  // as "seen" so we don't auto-navigate on load and overwrite a direct link to a past session.
  useEffect(() => {
    if (routeSessionId !== undefined && routeSessionId !== null && session.sessionId) {
      lastNavigatedSessionIdRef.current = session.sessionId;
    }
  }, [routeSessionId, session.sessionId]);

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
      <div className="flex h-screen">
        <Navbar
          currentSessionId={session.sessionId}
          selectedSessionId={selectedSessionId ?? session.sessionId}
          onSelectSession={handleSelectSession}
          refreshTrigger={session.sessionId}
          sessionActive={session.sessionActive}
          onStartSession={session.startSession}
          onEndSession={session.endSession}
        />
        <main className="flex-1 overflow-hidden">
          <Chat
            session={session}
            audioEnabled={audioEnabled}
            onToggleAudio={() => setAudioEnabled((v) => !v)}
            viewOnly={viewOnly}
            onSend={
              viewOnly && selectedSessionId
                ? (text: string) => {
                    session.resumeSession(selectedSessionId);
                    session.sendChat(text);
                  }
                : undefined
            }
          />
        </main>
      </div>
      {!connected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-xs text-white shadow-lg">
          Connecting to server...
        </div>
      )}
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </TooltipProvider>
  );
}

export function App() {
  useSystemTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        navigate(location.pathname === "/prompt-test" ? "/" : "/prompt-test");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);

  return (
    <Routes>
      <Route path="/prompt-test" element={<PromptTestPage />} />
      <Route path="/session/:sessionId" element={<MainView />} />
      <Route path="/" element={<MainView />} />
    </Routes>
  );
}
