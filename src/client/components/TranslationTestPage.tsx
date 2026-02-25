import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { parseMessageSegments } from "@/lib/sentences";
import { WordSelectable } from "@/components/WordSelectable";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2 } from "lucide-react";

const SAMPLE_CONTENT = `
<tl>El sol brillaba sobre el antiguo pueblo. Las calles estaban vacías y el viento traía olor a pan recién hecho desde la panadería.</tl>

<tl>En la plaza principal, una fuente de piedra llevaba siglos sin agua.

Los niños jugaban a la sombra de los árboles mientras las abuelas hablaban en los bancos.</tl>

<nl>This is a short **native-language** sentence so the formatter handles mixed segments.</nl>

<tl>Por la tarde, cuando el calor amainaba, los vecinos salían a sus balcones. La vida seguía su curso, lenta y tranquila, como siempre había sido.</tl>
`.trim();

const LANG = "es";

/** Get container text and selection start/end character indices (for correct tag placement). */
function getContainerTextAndSelection(
  container: Node,
  range: Range
): { containerText: string; startIdx: number; endIdx: number } | null {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return null;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const positions: { node: Text; offset: number }[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      positions.push({ node, offset: i });
    }
  }
  if (positions.length === 0) return null;
  const containerText = positions
    .map((p) => (p.node.textContent ?? "")[p.offset] ?? "")
    .join("");
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    if (p.node === range.startContainer && p.offset === range.startOffset) startIdx = i;
    if (p.node === range.endContainer && p.offset === range.endOffset - 1) endIdx = i + 1;
  }
  if (startIdx === -1) {
    for (let i = 0; i < positions.length; i++) {
      if (positions[i]!.node === range.startContainer && range.startOffset <= positions[i]!.offset) {
        startIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i]!.node === range.endContainer && positions[i]!.offset < range.endOffset) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (startIdx < 0 || endIdx <= startIdx) return null;
  return { containerText, startIdx, endIdx };
}

/** Build context with <TRANSLATE_THIS> at the selection's position in the container (not first occurrence). */
function buildMarkedContext(container: Node, range: Range): { context: string; text: string } | null {
  const info = getContainerTextAndSelection(container, range);
  if (!info) return null;
  const { containerText, startIdx, endIdx } = info;
  const text = range.toString().trim();
  const context =
    containerText.slice(0, startIdx) +
    "<TRANSLATE_THIS>" +
    containerText.slice(startIdx, endIdx) +
    "</TRANSLATE_THIS>" +
    containerText.slice(endIdx);
  return { context, text };
}

function isRectInViewport(rect: DOMRect): boolean {
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export function TranslationTestPage() {
  const segments = parseMessageSegments(SAMPLE_CONTENT, "tl");
  const [tooltip, setTooltip] = useState<{
    text: string;
    initialRect: DOMRect;
    translation: string | null;
    loading: boolean;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const tooltipTextRef = useRef<string | null>(null);
  const tooltipHoveredRef = useRef(false);

  const contextText = SAMPLE_CONTENT.replace(/<\/?(?:tl|nl|listen)>/g, "").trim();

  useEffect(() => {
    if (!tooltip) return;
    function handleMouseDown(e: MouseEvent) {
      const underCursor = document.elementFromPoint(e.clientX, e.clientY);
      if (underCursor?.closest?.("[data-translation-tooltip]")) {
        e.preventDefault();
        return;
      }
      setTooltip(null);
      rangeRef.current = null;
      tooltipTextRef.current = null;
      const sel = document.getSelection();
      if (sel) sel.removeAllRanges();
    }
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [tooltip]);

  useEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    tooltipHoveredRef.current = false;
    let rafId: number;
    const loop = () => {
      const range = rangeRef.current;
      const el = tooltipRef.current;
      if (!range || !el) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!tooltipHoveredRef.current) {
        el.style.left = `${rect.left + rect.width / 2}px`;
        el.style.top = `${rect.top - 8}px`;
        el.style.transform = "translate(-50%, -100%)";
      }

      if (!isRectInViewport(rect)) {
        setTooltip(null);
        rangeRef.current = null;
        tooltipTextRef.current = null;
        return;
      }
      const sel = window.getSelection();
      const selectedText = sel?.rangeCount ? sel.toString().trim() : "";
      if (selectedText !== (tooltipTextRef.current ?? "")) {
        setTooltip(null);
        rangeRef.current = null;
        tooltipTextRef.current = null;
        return;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [tooltip]);

  const doTranslate = (
    text: string,
    range: Range,
    container: Node | null,
    _rect: DOMRect
  ): Promise<void> => {
    let context: string;
    if (container) {
      const marked = buildMarkedContext(container, range);
      if (marked) {
        context = marked.context;
      } else {
        context = `${contextText}\n\n<TRANSLATE_THIS>${text}</TRANSLATE_THIS>`;
      }
    } else {
      const idx = contextText.indexOf(text);
      context =
        idx !== -1
          ? contextText.slice(0, idx) +
            `<TRANSLATE_THIS>${text}</TRANSLATE_THIS>` +
            contextText.slice(idx + text.length)
          : `${contextText}\n\n<TRANSLATE_THIS>${text}</TRANSLATE_THIS>`;
    }
    const body = { sentence: text, lang: LANG, context };
    console.log("[translate] request to API:", body);
    return apiFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data: { translation: string | null }) => {
        setTooltip((prev) =>
          prev ? { ...prev, translation: data.translation, loading: false } : prev
        );
      })
      .catch(() => {
        setTooltip((prev) =>
          prev ? { ...prev, translation: "(translation failed)", loading: false } : prev
        );
      });
  };

  const handleSelectionForTranslation = (text: string, rect: DOMRect, range: Range) => {
    rangeRef.current = range;
    tooltipTextRef.current = text;
    setTooltip({ text, initialRect: rect, translation: null, loading: true });
    doTranslate(text, range, contentRef.current, rect);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-2xl border bg-card px-6 py-5 shadow-sm">
          <h1 className="text-lg font-semibold mb-4">Translation test</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Select text to see translation. Same segment formatter as message bubbles.
          </p>
          <div ref={contentRef}>
            <WordSelectable
              className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              onSelectionForTranslation={handleSelectionForTranslation}
            >
              {segments.map((seg, i) => (
                <ReactMarkdown key={i}>{seg.text}</ReactMarkdown>
              ))}
            </WordSelectable>
          </div>
        </div>
      </div>
      {tooltip && (
        <div
          ref={tooltipRef}
          data-translation-tooltip
          className="fixed z-[100] rounded-lg border bg-popover px-3 py-2 shadow-md"
          style={{
            left: tooltip.initialRect.left + tooltip.initialRect.width / 2,
            top: tooltip.initialRect.top - 8,
            transform: "translate(-50%, -100%)",
            pointerEvents: "auto",
          }}
          onMouseEnter={() => (tooltipHoveredRef.current = true)}
          onMouseLeave={() => (tooltipHoveredRef.current = false)}
        >
          {tooltip.loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Translating...
            </span>
          ) : (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&>*]:my-0">
              <ReactMarkdown>{tooltip.translation ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
