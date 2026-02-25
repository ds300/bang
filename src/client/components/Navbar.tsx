import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MessageSquare, Archive, Loader2 } from "lucide-react";
import { SessionControls } from "@/components/SessionControls";

export interface SessionListItem {
  id: string;
  lang: string;
  type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
}

interface NavbarProps {
  currentSessionId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  /** When this changes (e.g. new session started/ended), session list is refetched */
  refreshTrigger?: string | null;
  sessionActive: boolean;
  onStartSession: () => void;
  onEndSession: (discard?: boolean) => void;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Navbar({
  currentSessionId,
  selectedSessionId,
  onSelectSession,
  refreshTrigger,
  sessionActive,
  onStartSession,
  onEndSession,
}: NavbarProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshTrigger]);

  return (
    <nav className="flex w-52 flex-col border-r bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
        <h1 className="text-lg font-semibold tracking-tight">bang</h1>
        <SessionControls
          sessionActive={sessionActive}
          onStartSession={onStartSession}
          onEndSession={onEndSession}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
          Sessions
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : (
          <ul className="space-y-0.5">
            {!currentSessionId && (
              <li>
                <button
                  type="button"
                  onClick={() => onSelectSession(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    selectedSessionId === null
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">New session</span>
                </button>
              </li>
            )}
            {sessions.map((s) => {
              const isCurrent = s.id === currentSessionId;
              const isSelected = s.id === selectedSessionId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground",
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {isCurrent && s.status === "active"
                        ? "Current"
                        : formatSessionDate(s.started_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 border-t pt-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {}}
            title="Archive (coming soon)"
          >
            <Archive className="h-3.5 w-3.5 shrink-0" />
            archive
          </button>
        </div>
      </div>

      <div className="border-t px-2 py-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Preferences (coming soon)"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            ?
          </span>
          <span className="truncate">Preferences</span>
        </button>
      </div>
    </nav>
  );
}
