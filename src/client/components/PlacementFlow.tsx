import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/hooks/useAuth";
import { TranslatableContent } from "@/components/TranslatableContent";
import { Button } from "@/components/ui/button";
import type { UnderlinedRange } from "@/components/TranslatableContent";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2 } from "lucide-react";

/** Split text into paragraphs with full-text start/end indices for highlight mapping. */
function getParagraphsWithOffsets(text: string): { text: string; startIdx: number; endIdx: number }[] {
  if (!text.trim()) return [];
  const re = /\n\n+/g;
  let pos = 0;
  const result: { text: string; startIdx: number; endIdx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = text.slice(pos, m.index);
    const t = raw.trim();
    if (t) {
      const start = pos + raw.indexOf(t);
      result.push({ text: t, startIdx: start, endIdx: start + t.length });
    }
    pos = m.index + m[0].length;
  }
  const raw = text.slice(pos);
  const t = raw.trim();
  if (t) {
    const start = pos + raw.indexOf(t);
    result.push({ text: t, startIdx: start, endIdx: start + t.length });
  }
  return result;
}

/** Cache latest highlights by placement run id so they survive remounts (e.g. React Strict Mode). */
const highlightsCache: Record<number, UnderlinedRange[]> = {};

export function PlacementFlow() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [step, setStep] = useState<"loading" | "reading" | "exercises" | "summary">("loading");
  const [placementId, setPlacementId] = useState<number | null>(null);
  const [placementText, setPlacementText] = useState<string>("");
  const [highlights, setHighlights] = useState<UnderlinedRange[]>([]);
  const [restTooDifficult, setRestTooDifficult] = useState(false);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Array<{ ordinal: number; prompt: string; type: string; user_answer?: string | null }>>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [continueLoading, setContinueLoading] = useState(false);
  const [startFirstSessionLoading, setStartFirstSessionLoading] = useState(false);
  const [exerciseSubmitLoading, setExerciseSubmitLoading] = useState(false);

  const ensureRun = useCallback(async () => {
    if (!lang) return;
    setError(null);
    try {
      const getRes = await apiFetch(`/api/placement/run?lang=${encodeURIComponent(lang)}`);
      const getData = (await getRes.json()) as { run?: { id: number; placement_text: string; highlights: unknown; rest_too_difficult: boolean; status: string } };
      if (getData.run?.placement_text) {
        const runId = getData.run.id;
        setPlacementId(runId);
        setPlacementText(getData.run.placement_text);
        const h = getData.run.highlights as Array<{ startIdx: number; endIdx: number; translation?: string }> | null;
        const fromApi = h?.length ? h.map((r) => ({ startIdx: r.startIdx, endIdx: r.endIdx, translation: r.translation ?? "Marked" })) : [];
        // Prefer cache so highlights survive remount (e.g. React Strict Mode)
        const cached = highlightsCache[runId];
        setHighlights(cached?.length ? cached : fromApi);
        if (!cached?.length) highlightsCache[runId] = fromApi;
        setRestTooDifficult(getData.run.rest_too_difficult ?? false);
        const status = getData.run.status ?? "text";
        if (status === "exercises") {
          const exRes = await apiFetch(`/api/placement/run/${runId}/exercises`);
          if (exRes.ok) {
            const exData = (await exRes.json()) as { exercises?: Array<{ ordinal: number; prompt: string; type: string; user_answer?: string | null }> };
            const list = exData.exercises ?? [];
            if (list.length > 0) {
              setExercises(list);
              setCurrentExerciseIndex(0);
              setExerciseAnswer("");
            }
          }
          setStep("exercises");
        } else if (status === "completed") {
          setStep("summary");
        } else {
          setStep("reading");
        }
        return;
      }
      const genRes = await apiFetch("/api/placement/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!genRes.ok) {
        const err = (await genRes.json()) as { error?: string };
        setError(err.error ?? "Failed to generate text");
        return;
      }
      const genData = (await genRes.json()) as { text: string };
      const createRes = await apiFetch("/api/placement/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, placement_text: genData.text }),
      });
      if (!createRes.ok) {
        setError("Failed to create placement run");
        return;
      }
      const createData = (await createRes.json()) as { placement_id: number; placement_text: string };
      const newRunId = createData.placement_id;
      setPlacementId(newRunId);
      setPlacementText(createData.placement_text);
      highlightsCache[newRunId] = [];
      setHighlights([]);
      setStep("reading");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [lang]);

  useEffect(() => {
    ensureRun();
  }, [ensureRun]);

  const handleBack = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const paragraphsWithOffsets = useMemo(
    () => getParagraphsWithOffsets(placementText),
    [placementText],
  );

  const currentParagraph = paragraphsWithOffsets[currentParagraphIndex] ?? null;
  const paragraphStartIdx = currentParagraph?.startIdx ?? 0;
  const paragraphEndIdx = currentParagraph?.endIdx ?? 0;
  const paragraphHighlights: UnderlinedRange[] = useMemo(() => {
    if (!currentParagraph) return [];
    return highlights
      .filter((r) => r.endIdx > paragraphStartIdx && r.startIdx < paragraphEndIdx)
      .map((r) => ({
        startIdx: Math.max(0, r.startIdx - paragraphStartIdx),
        endIdx: Math.min(currentParagraph.text.length, r.endIdx - paragraphStartIdx),
        translation: r.translation,
      }));
  }, [currentParagraph, highlights, paragraphStartIdx, paragraphEndIdx]);

  const handleParagraphHighlightsChange = useCallback(
    (ranges: UnderlinedRange[]) => {
      const others = highlights.filter(
        (r) => r.endIdx <= paragraphStartIdx || r.startIdx >= paragraphEndIdx,
      );
      const converted = ranges.map((r) => ({
        ...r,
        startIdx: r.startIdx + paragraphStartIdx,
        endIdx: r.endIdx + paragraphStartIdx,
      }));
      const next = [...others, ...converted].sort(
        (a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx,
      );
      setHighlights(next);
      if (placementId != null) highlightsCache[placementId] = next;
    },
    [highlights, placementId, paragraphStartIdx, paragraphEndIdx],
  );

  useEffect(() => {
    if (step !== "reading" || placementId == null) return;
    const t = setTimeout(() => {
      apiFetch(`/api/placement/run/${placementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highlights: highlights.map((r) => ({
            startIdx: r.startIdx,
            endIdx: r.endIdx,
            translation: r.translation,
          })),
          rest_too_difficult: restTooDifficult,
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [step, placementId, highlights, restTooDifficult]);

  const handleContinueToExercises = useCallback(
    async (restTooDifficultOverride?: boolean) => {
      if (placementId == null) return;
      setError(null);
      setContinueLoading(true);
      const useRestTooDifficult = restTooDifficultOverride ?? restTooDifficult;
      try {
        const patchRes = await apiFetch(`/api/placement/run/${placementId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            highlights: highlights.map((r) => ({
              startIdx: r.startIdx,
              endIdx: r.endIdx,
              translation: r.translation,
            })),
            rest_too_difficult: useRestTooDifficult,
            status: "exercises",
          }),
        });
      if (!patchRes.ok) {
        const data = (await patchRes.json()) as { error?: string };
        setError(data.error ?? "Failed to save");
        setContinueLoading(false);
        return;
      }
      const phase1Res = await apiFetch(`/api/placement/run/${placementId}/phase1`, { method: "POST" });
      if (!phase1Res.ok) {
        const data = (await phase1Res.json()) as { error?: string };
        setError(data.error ?? "Phase 1 failed");
        setContinueLoading(false);
        return;
      }
      const phase2Res = await apiFetch(`/api/placement/run/${placementId}/phase2`, { method: "POST" });
      if (!phase2Res.ok) {
        const data = (await phase2Res.json()) as { error?: string };
        setError(data.error ?? "Phase 2 failed");
        setContinueLoading(false);
        return;
      }
      const exRes = await apiFetch(`/api/placement/run/${placementId}/exercises`);
      if (!exRes.ok) {
        setError("Failed to load exercises");
        setContinueLoading(false);
        return;
      }
      const exData = (await exRes.json()) as { exercises?: Array<{ ordinal: number; prompt: string; type: string; user_answer?: string | null }> };
      const exerciseList = exData.exercises ?? [];
      if (exerciseList.length === 0) {
        setError("No exercises were generated. Please try again or go back.");
        setContinueLoading(false);
        return;
      }
      setExercises(exerciseList);
      setCurrentExerciseIndex(0);
      setExerciseAnswer("");
      setStep("exercises");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setContinueLoading(false);
    }
    },
    [placementId, highlights, restTooDifficult],
  );

  const handleContinue = useCallback(() => {
    if (paragraphsWithOffsets.length === 0) return;
    if (currentParagraphIndex < paragraphsWithOffsets.length - 1) {
      setCurrentParagraphIndex((i) => i + 1);
    } else {
      handleContinueToExercises();
    }
  }, [paragraphsWithOffsets.length, currentParagraphIndex, handleContinueToExercises]);

  const handleTooHard = useCallback(() => {
    setRestTooDifficult(true);
    handleContinueToExercises(true);
  }, [handleContinueToExercises]);

  const onTranslatePlacement = useCallback(
    async (context: string, signal?: AbortSignal): Promise<string | null> => {
      if (!lang) return null;
      try {
        const res = await apiFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, context }),
          signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { translation?: string };
        return data.translation ?? null;
      } catch {
        return null;
      }
    },
    [lang],
  );

  const handleExerciseSubmit = useCallback(async () => {
    if (placementId == null || exercises.length === 0 || exerciseSubmitLoading) return;
    const ordinal = currentExerciseIndex + 1;
    setError(null);
    setExerciseSubmitLoading(true);
    try {
      await apiFetch(`/api/placement/run/${placementId}/exercises/${ordinal}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_answer: exerciseAnswer }),
      });
      setExerciseAnswer("");
      if (currentExerciseIndex >= exercises.length - 1) {
        const phase3Res = await apiFetch(`/api/placement/run/${placementId}/phase3`, { method: "POST" });
        if (!phase3Res.ok) {
          const data = (await phase3Res.json()) as { error?: string };
          setError(data.error ?? "Phase 3 failed");
          setExerciseSubmitLoading(false);
          return;
        }
        const data = (await phase3Res.json()) as { summary?: string };
        setSummaryText(data.summary ?? "");
        setStep("summary");
      } else {
        setCurrentExerciseIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save answer");
    } finally {
      setExerciseSubmitLoading(false);
    }
  }, [placementId, exercises.length, currentExerciseIndex, exerciseAnswer, exerciseSubmitLoading]);

  const handleStartFirstSession = useCallback(async () => {
    if (!lang || startFirstSessionLoading) return;
    setStartFirstSessionLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) {
        setError("Failed to start session");
        setStartFirstSessionLoading(false);
        return;
      }
      const data = (await res.json()) as { sessionId: string };
      navigate(`/session/${data.sessionId}`);
    } catch {
      setError("Failed to start session");
      setStartFirstSessionLoading(false);
    }
  }, [lang, navigate, startFirstSessionLoading]);

  if (!auth.isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Please log in to continue.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back</Button>
      </div>
    );
  }

  if (!lang) {
    return (
      <div className="flex h-screen items-center justify-center gap-4">
        <p className="text-muted-foreground">Missing language.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back</Button>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Preparing placement text…</p>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  if (step === "reading") {
    const paragraphCount = paragraphsWithOffsets.length;
    const isLastParagraph = currentParagraphIndex >= paragraphCount - 1 && paragraphCount > 0;
    return (
      <div className="flex h-screen flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-muted-foreground text-sm">
            {paragraphCount > 0
              ? `Paragraph ${currentParagraphIndex + 1} of ${paragraphCount}`
              : "Highlight what you don't understand"}
          </span>
        </div>
        <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
          <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">
            Click and drag to highlight the parts you don&apos;t understand
          </h2>
          <div className="mx-auto max-w-2xl text-center">
            {currentParagraph ? (
              <TranslatableContent
                markdown={currentParagraph.text}
                lang={lang}
                onTranslate={onTranslatePlacement}
                underlinedRanges={paragraphHighlights}
                onUnderlinedRangesChange={handleParagraphHighlightsChange}
                className="prose prose-sm dark:prose-invert mx-auto max-w-none text-center"
              />
            ) : (
              <p className="text-muted-foreground">No content to show.</p>
            )}
          </div>
        </main>
        <div className="border-t px-4 py-3">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {error && (
              <span className="text-destructive text-sm">{error}</span>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                onClick={handleTooHard}
                disabled={continueLoading}
              >
                This is too hard
              </Button>
              <Button
                onClick={handleContinue}
                disabled={continueLoading || !currentParagraph}
              >
                {continueLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : paragraphHighlights.length === 0 ? (
                  "I understand all of this"
                ) : isLastParagraph ? (
                  "Continue to exercises"
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "exercises") {
    const current = exercises[currentExerciseIndex];
    const hasExercises = exercises.length > 0;
    return (
      <div className="flex h-screen flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-muted-foreground text-sm">
            Exercise {currentExerciseIndex + 1} of {exercises.length}
          </span>
        </div>
        <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-2xl">
            {!hasExercises ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-center text-muted-foreground">
                  Exercises couldn&apos;t be loaded. You can go back and try again.
                </p>
                <Button variant="outline" onClick={handleBack}>
                  Back to reading
                </Button>
              </div>
            ) : current ? (
              <>
                <div className="prose prose-sm dark:prose-invert max-w-none mb-2 font-medium">
                  <ReactMarkdown>{current.prompt}</ReactMarkdown>
                </div>
                <p className="text-muted-foreground text-xs">Give it your best shot. You can say &quot;I forgot the word for X&quot; or add context.</p>
                <textarea
                  className="mt-2 w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Your answer..."
                  value={exerciseAnswer}
                  onChange={(e) => setExerciseAnswer(e.target.value)}
                  rows={4}
                />
                {error && <p className="mt-2 text-destructive text-sm">{error}</p>}
                <Button
                  className="mt-2"
                  onClick={handleExerciseSubmit}
                  disabled={!exerciseAnswer.trim() || exerciseSubmitLoading}
                >
                  {exerciseSubmitLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : currentExerciseIndex >= exercises.length - 1 ? (
                    "Finish"
                  ) : (
                    "Next"
                  )}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">Loading exercises…</p>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (step === "summary") {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
          <div className="prose prose-sm dark:prose-invert mx-auto max-w-2xl">
            {summaryText ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">Summary</p>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button
            onClick={handleStartFirstSession}
            disabled={startFirstSessionLoading}
          >
            {startFirstSessionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "OK — Start first session"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
