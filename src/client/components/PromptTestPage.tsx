import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { TEST_SCENARIOS } from "@/lib/test-scenarios";
import type { TestScenario } from "@/lib/test-scenarios";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ArrowLeft, Play } from "lucide-react";

interface PromptInfo {
  systemPrompt: string;
  tools: Array<{ name: string; description: string }>;
  context: Record<string, unknown>;
  generatedAt: string;
}

interface RunResult {
  text: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  stopReason: string;
  error?: string;
}

export function PromptTestPage() {
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptUpdated, setPromptUpdated] = useState(false);

  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [editableMessages, setEditableMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  const lastGeneratedAt = useRef<string | null>(null);

  const scenario = TEST_SCENARIOS[scenarioIdx]!;

  const fetchPrompt = useCallback(async () => {
    try {
      const res = await apiFetch("/api/prompt-test");
      const data = (await res.json()) as PromptInfo;

      if (lastGeneratedAt.current && lastGeneratedAt.current !== data.generatedAt) {
        setPromptUpdated(true);
        setTimeout(() => setPromptUpdated(false), 3000);
      }

      lastGeneratedAt.current = data.generatedAt;
      setPrompt(data);
    } catch {
      // ignore fetch errors during polling
    }
    setPromptLoading(false);
  }, []);

  useEffect(() => {
    fetchPrompt();
    const interval = setInterval(fetchPrompt, 5000);
    return () => clearInterval(interval);
  }, [fetchPrompt]);

  useEffect(() => {
    setEditableMessages(scenario.messages.map((m) => ({ ...m })));
    setResult(null);
  }, [scenario]);

  function updateMessage(idx: number, content: string) {
    setEditableMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, content } : m)),
    );
  }

  async function runScenario() {
    setRunning(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/prompt-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: editableMessages }),
      });
      const data = (await res.json()) as RunResult;
      setResult(data);
    } catch (err) {
      setResult({
        text: "",
        toolCalls: [],
        stopReason: "error",
        error: err instanceof Error ? err.message : "Request failed",
      });
    }
    setRunning(false);
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-lg font-semibold">Prompt Test</h1>
        </div>
        <div className="flex items-center gap-2">
          {promptUpdated && (
            <span className="rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
              Prompt updated
            </span>
          )}
          {prompt && (
            <span className="text-xs text-muted-foreground">
              Server started: {new Date(prompt.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchPrompt}
            title="Refresh prompt from server"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: System Prompt */}
        <div className="flex w-1/2 flex-col border-r">
          <div className="border-b px-4 py-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Current System Prompt
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {promptLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : prompt ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {prompt.systemPrompt}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Failed to load prompt from server
              </p>
            )}
          </div>
          {prompt && (
            <div className="border-t px-4 py-2">
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Available tools ({prompt.tools.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {prompt.tools.map((t) => (
                    <li key={t.name} className="text-xs">
                      <span className="font-mono font-medium">{t.name}</span>
                      <span className="text-muted-foreground"> — {t.description}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>

        {/* Right: Scenario Runner */}
        <div className="flex w-1/2 flex-col">
          <div className="border-b px-4 py-2">
            <div className="flex items-center gap-3">
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={scenarioIdx}
                onChange={(e) => setScenarioIdx(Number(e.target.value))}
              >
                {TEST_SCENARIOS.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={runScenario}
                disabled={running || !prompt}
              >
                {running ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                Run
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {scenario.description}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Messages */}
            <div className="border-b px-4 py-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Conversation
              </h3>
              <div className="space-y-2">
                {editableMessages.map((msg, i) => (
                  <div key={i} className="flex gap-2">
                    <span
                      className={`mt-1 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                        msg.role === "user"
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {msg.role}
                    </span>
                    <textarea
                      className="flex-1 resize-none rounded-md border bg-background px-2 py-1 font-mono text-xs leading-relaxed"
                      value={msg.content}
                      onChange={(e) => updateMessage(i, e.target.value)}
                      rows={Math.min(
                        6,
                        Math.max(2, msg.content.split("\n").length),
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Results */}
            {running && (
              <div className="flex items-center gap-2 px-4 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running scenario...
              </div>
            )}

            {result && (
              <div className="px-4 py-3 space-y-4">
                {result.error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {result.error}
                  </div>
                )}

                {result.toolCalls.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Tool Calls
                    </h3>
                    <div className="space-y-2">
                      {result.toolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="rounded-md border bg-muted/50 p-3"
                        >
                          <div className="mb-1 font-mono text-xs font-semibold text-blue-400">
                            {tc.name}
                          </div>
                          <pre className="whitespace-pre-wrap break-words text-xs">
                            {JSON.stringify(tc.input, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.text && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Response
                      <span className="ml-2 font-normal normal-case text-muted-foreground">
                        (stop: {result.stopReason})
                      </span>
                    </h3>
                    <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                      {result.text}
                    </pre>
                  </div>
                )}

                {!result.text && result.toolCalls.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Agent used tools but produced no text (stop: {result.stopReason}).
                    In production the harness would execute tools and continue.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
