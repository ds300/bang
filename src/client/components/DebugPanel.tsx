import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, RefreshCw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "overview" | "tables" | "actions" | "events" | "context";

export function DebugPanel({ open, onClose }: DebugPanelProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const fetchData = useCallback(
    async (action: string, params?: Record<string, string>) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ action, ...params });
        const res = await apiFetch(`/api/debug?${qs}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setData({ error: String(err) });
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (tab === "tables" && selectedTable) {
      fetchData("query", { table: selectedTable });
    } else if (tab === "tables") {
      fetchData("tables");
    } else {
      fetchData(tab);
    }
  }, [open, tab, selectedTable, fetchData]);

  if (!open) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "tables", label: "Database" },
    { id: "actions", label: "Agent Log" },
    { id: "events", label: "Events" },
    { id: "context", label: "Context" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-sm">Debug Panel</h2>
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => {
                    setTab(t.id);
                    setSelectedTable(null);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                if (tab === "tables" && selectedTable) {
                  fetchData("query", { table: selectedTable });
                } else if (tab === "tables") {
                  fetchData("tables");
                } else {
                  fetchData(tab);
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <DebugContent
              tab={tab}
              data={data}
              selectedTable={selectedTable}
              onSelectTable={(t) => setSelectedTable(t)}
              onBackToTables={() => setSelectedTable(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DebugContent({
  tab,
  data,
  selectedTable,
  onSelectTable,
  onBackToTables,
}: {
  tab: Tab;
  data: unknown;
  selectedTable: string | null;
  onSelectTable: (t: string) => void;
  onBackToTables: () => void;
}) {
  if (!data) return null;
  const d = data as Record<string, unknown>;

  switch (tab) {
    case "overview":
      return <OverviewTab data={d} />;
    case "tables":
      if (selectedTable) {
        return (
          <TableBrowser
            table={selectedTable}
            data={d}
            onBack={onBackToTables}
          />
        );
      }
      return (
        <TableList
          tables={(d.tables as string[]) ?? []}
          onSelect={onSelectTable}
        />
      );
    case "actions":
      return <ActionsTab data={d} />;
    case "events":
      return <EventsTab data={d} />;
    case "context":
      return <ContextTab data={d} />;
    default:
      return <JsonView data={data} />;
  }
}

function OverviewTab({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <Section title="Profile">
        <JsonView data={(data.profile as unknown[])?.[0] ?? null} />
      </Section>
      <Section title="Language Profile">
        <JsonView data={(data.langProfile as unknown[])?.[0] ?? null} />
      </Section>
      <Section title="Concept Counts">
        <JsonView data={data.conceptCounts} />
      </Section>
      <Section title={`Upcoming Concepts: ${data.upcomingConceptCount}`}>
        <span className="text-xs text-muted-foreground">
          Concepts in upcoming queue
        </span>
      </Section>
      <Section title={`Events: ${data.eventCount}`}>
        <span className="text-xs text-muted-foreground">
          Total events logged
        </span>
      </Section>
      <Section title="Sessions">
        <div className="space-y-1">
          {((data.sessions as Array<Record<string, unknown>>) ?? []).map(
            (s) => (
              <div
                key={s.id as string}
                className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs"
              >
                <span className="font-mono">
                  {(s.id as string).slice(0, 8)}...
                </span>
                <span>{s.lang as string}</span>
                <span
                  className={cn(
                    "font-medium",
                    s.status === "active"
                      ? "text-green-600"
                      : s.status === "completed"
                        ? "text-blue-600"
                        : "text-muted-foreground",
                  )}
                >
                  {s.status as string}
                </span>
                <span className="text-muted-foreground">
                  {new Date(s.started_at as string).toLocaleString()}
                </span>
              </div>
            ),
          )}
        </div>
      </Section>
    </div>
  );
}

function TableList({
  tables,
  onSelect,
}: {
  tables: string[];
  onSelect: (t: string) => void;
}) {
  return (
    <div className="space-y-1">
      {tables.map((t) => (
        <button
          key={t}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted"
          onClick={() => onSelect(t)}
        >
          <span className="font-mono">{t}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <td
      className="group/cell relative max-w-[200px] truncate px-2 py-1.5 pr-7 font-mono"
      title={value}
    >
      {value}
      <button
        onClick={handleCopy}
        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </td>
  );
}

function TableBrowser({
  table,
  data,
  onBack,
}: {
  table: string;
  data: Record<string, unknown>;
  onBack: () => void;
}) {
  const rows = (data.rows as Array<Record<string, unknown>>) ?? [];
  const total = (data.total as number) ?? 0;

  if (rows.length === 0) {
    return (
      <div>
        <button
          className="mb-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          ← Back to tables
        </button>
        <p className="text-sm text-muted-foreground">
          No rows in <code className="font-mono">{table}</code>
        </p>
      </div>
    );
  }

  const cols = Object.keys(rows[0]!);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          ← Back to tables
        </button>
        <span className="text-xs text-muted-foreground">
          {total} rows in <code className="font-mono">{table}</code>
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted">
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map((c) => (
                  <CopyCell key={c} value={String(row[c] ?? "")} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionsTab({ data }: { data: Record<string, unknown> }) {
  const actions = (data.actions as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="space-y-2">
      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">No agent actions logged yet.</p>
      )}
      {actions.map((a) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(a.data as string);
        } catch {
          parsed = a.data;
        }
        return (
          <div key={a.id as number} className="rounded-md border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold">{a.type as string}</span>
              <span className="text-xs text-muted-foreground">
                {a.session_id
                  ? `session: ${(a.session_id as string).slice(0, 8)}...`
                  : ""}
              </span>
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
              {JSON.stringify(parsed, null, 2)}
            </pre>
            <span className="text-xs text-muted-foreground">
              {a.created_at as string}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EventsTab({ data }: { data: Record<string, unknown> }) {
  const events = (data.events as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="space-y-2">
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">No events logged yet.</p>
      )}
      {events.map((e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data as string);
        } catch {
          parsed = e.data;
        }
        return (
          <div key={e.id as number} className="rounded-md border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-600">
                {e.type as string}
              </span>
              <div className="flex gap-2 text-xs text-muted-foreground">
                {e.lang && <span>lang: {e.lang as string}</span>}
                {e.session_id && (
                  <span>
                    session: {(e.session_id as string).slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
              {JSON.stringify(parsed, null, 2)}
            </pre>
            <span className="text-xs text-muted-foreground">
              {e.created_at as string}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ContextTab({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <Section title="Agent Context">
        <JsonView data={data.context} />
      </Section>
      <Section title="System Prompt">
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
          {data.systemPrompt as string}
        </pre>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function JsonView({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <span className="text-xs text-muted-foreground italic">null</span>
    );
  }
  return (
    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
