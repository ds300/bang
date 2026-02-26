/**
 * Reusable translation tooltips: wrap content so users can select or hover text to see
 * translations. Uses WordSelectable for selection, underlines translated ranges, and
 * shows one tooltip per range (selection or hover, deduped). See TranslationTestPage
 * for the full design doc; this component encapsulates that behavior.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  WordSelectable,
  type UnderlinedRange as WordSelectableUnderlinedRange,
} from "@/components/WordSelectable";
import {
  getContainerTextAndSelection,
  getContainerText,
} from "@/lib/contentRanges";
import { Loader2, X } from "lucide-react";

const SELECTION_TOOLTIP_REVEAL_MS = 100;
const HOVER_TOOLTIP_CLOSE_MS = 300;
const TRANSLATION_TOOLTIP_TOP_OFFSET = 5;

function buildMarkedContext(
  container: Node,
  range: Range
): { context: string; text: string } | null {
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

function scheduleSelectionTooltipReveal(
  revealImmediately: boolean,
  timeoutRef: { current: ReturnType<typeof setTimeout> | null },
  setRevealed: (v: boolean) => void
) {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
  if (revealImmediately) {
    setRevealed(true);
  } else {
    setRevealed(false);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setRevealed(true);
    }, SELECTION_TOOLTIP_REVEAL_MS);
  }
}

function getTranslationTooltipPosition(rect: DOMRect) {
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + TRANSLATION_TOOLTIP_TOP_OFFSET,
    transform: "translate(-50%, -100%)" as const,
  };
}

export type { WordSelectableUnderlinedRange as UnderlinedRange };

export interface TranslatableContentProps {
  children: React.ReactNode;
  /** Language code for translation (e.g. "es"). Passed to onTranslate for API calls. */
  lang: string;
  /** Called when user selects text. Return the translation or null on error. Signal is aborted when selection changes before the request completes. */
  onTranslate: (
    text: string,
    context: string,
    signal?: AbortSignal
  ) => Promise<string | null>;
  className?: string;
  /** Optional: persist underlined ranges (e.g. per message). */
  underlinedRanges?: WordSelectableUnderlinedRange[];
  onUnderlinedRangesChange?: (
    ranges: WordSelectableUnderlinedRange[]
  ) => void;
}

export function TranslatableContent({
  children,
  lang,
  onTranslate,
  className,
  underlinedRanges: underlinedRangesProp,
  onUnderlinedRangesChange,
}: TranslatableContentProps) {
  const [internalUnderlinedRanges, setInternalUnderlinedRanges] = useState<
    WordSelectableUnderlinedRange[]
  >([]);
  const underlinedRanges =
    underlinedRangesProp !== undefined
      ? underlinedRangesProp
      : internalUnderlinedRanges;
  const setUnderlinedRanges = useCallback(
    (
      updater: (
        prev: WordSelectableUnderlinedRange[]
      ) => WordSelectableUnderlinedRange[]
    ) => {
      if (onUnderlinedRangesChange) {
        onUnderlinedRangesChange(updater(underlinedRanges));
      } else {
        setInternalUnderlinedRanges(updater);
      }
    },
    [underlinedRanges, onUnderlinedRangesChange]
  );

  const [selectionTooltip, setSelectionTooltip] = useState<{
    startIdx: number;
    endIdx: number;
    text: string;
    initialRect: DOMRect;
    translation: string | null;
    loading: boolean;
  } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    startIdx: number;
    endIdx: number;
    translation: string;
    initialRect: DOMRect;
  } | null>(null);
  const [selectionTooltipRevealed, setSelectionTooltipRevealed] = useState(false);

  const selectionTooltipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const tooltipTextRef = useRef<string | null>(null);
  const tooltipHoveredRef = useRef(false);
  const translateAbortRef = useRef<AbortController | null>(null);
  const hoverTooltipCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const selectionTooltipRevealTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const isPointerOverTooltipRef = useRef(false);

  const hasAnyTooltip = selectionTooltip !== null || hoverTooltip !== null;

  useEffect(() => {
    if (!hasAnyTooltip) return;
    const selTip = selectionTooltip;
    const hovTip = hoverTooltip;
    function handleMouseDown(e: MouseEvent) {
      const underCursor = document.elementFromPoint(e.clientX, e.clientY);
      if (underCursor?.closest?.("[data-translation-tooltip]")) {
        e.preventDefault();
        return;
      }
      const content = contentRef.current;
      if (content?.contains(underCursor)) {
        const x = e.clientX;
        const y = e.clientY;
        if (selTip && rangeRef.current) {
          const rect = rangeRef.current.getBoundingClientRect();
          if (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          ) {
            return;
          }
        }
        if (hovTip) {
          const r = hovTip.initialRect;
          if (
            x >= r.left &&
            x <= r.right &&
            y >= r.top &&
            y <= r.bottom
          ) {
            return;
          }
        }
      }
      if (selectionTooltipRevealTimeoutRef.current) {
        clearTimeout(selectionTooltipRevealTimeoutRef.current);
        selectionTooltipRevealTimeoutRef.current = null;
      }
      setSelectionTooltipRevealed(false);
      setSelectionTooltip(null);
      setHoverTooltip(null);
      rangeRef.current = null;
      tooltipTextRef.current = null;
      const sel = document.getSelection();
      if (sel) sel.removeAllRanges();
    }
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [hasAnyTooltip, selectionTooltip, hoverTooltip]);

  useEffect(() => {
    if (!selectionTooltip || !selectionTooltipRef.current) return;
    tooltipHoveredRef.current = false;
    let rafId: number;
    const loop = () => {
      const range = rangeRef.current;
      const el = selectionTooltipRef.current;
      if (!range || !el) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!tooltipHoveredRef.current) {
        const pos = getTranslationTooltipPosition(rect);
        el.style.left = `${pos.left}px`;
        el.style.top = `${pos.top}px`;
        el.style.transform = pos.transform;
      }

      if (!isRectInViewport(rect)) {
        if (selectionTooltipRevealTimeoutRef.current) {
          clearTimeout(selectionTooltipRevealTimeoutRef.current);
          selectionTooltipRevealTimeoutRef.current = null;
        }
        setSelectionTooltipRevealed(false);
        setSelectionTooltip(null);
        rangeRef.current = null;
        tooltipTextRef.current = null;
        return;
      }
      const sel = window.getSelection();
      const selectedText = sel?.rangeCount ? sel.toString().trim() : "";
      if (selectedText !== (tooltipTextRef.current ?? "")) {
        if (selectionTooltipRevealTimeoutRef.current) {
          clearTimeout(selectionTooltipRevealTimeoutRef.current);
          selectionTooltipRevealTimeoutRef.current = null;
        }
        setSelectionTooltipRevealed(false);
        setSelectionTooltip(null);
        rangeRef.current = null;
        tooltipTextRef.current = null;
        return;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [selectionTooltip]);

  const doTranslate = useCallback(
    (
      text: string,
      range: Range,
      container: Node | null,
      rangeStartIdx: number | undefined,
      rangeEndIdx: number | undefined,
      signal?: AbortSignal
    ): Promise<void> => {
      let context: string;
      if (container) {
        const marked = buildMarkedContext(container, range);
        context = marked
          ? marked.context
          : `${getContainerText(container)}\n\n<TRANSLATE_THIS>${text}</TRANSLATE_THIS>`;
      } else {
        context = `<TRANSLATE_THIS>${text}</TRANSLATE_THIS>`;
      }
      return onTranslate(text, context, signal)
        .then((translation) => {
          if (signal?.aborted) return;
          const result = translation ?? "(translation failed)";
          setSelectionTooltip((prev) =>
            prev ? { ...prev, translation: result, loading: false } : prev
          );
          if (
            rangeStartIdx !== undefined &&
            rangeEndIdx !== undefined &&
            translation
          ) {
            setUnderlinedRanges((prev) =>
              prev.map((r) =>
                r.startIdx <= rangeStartIdx && r.endIdx >= rangeEndIdx
                  ? { ...r, translation }
                  : r
              )
            );
          }
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          setSelectionTooltip((prev) =>
            prev
              ? {
                  ...prev,
                  translation: "(translation failed)",
                  loading: false,
                }
              : prev
          );
        });
    },
    [onTranslate, setUnderlinedRanges]
  );

  const handleSelectionForTranslation = useCallback(
    (text: string, rect: DOMRect, range: Range) => {
      rangeRef.current = range;
      tooltipTextRef.current = text;
      const container = contentRef.current;
      let startIdx: number | undefined;
      let endIdx: number | undefined;
      if (container) {
        const info = getContainerTextAndSelection(container, range);
        if (info) {
          startIdx = info.startIdx;
          endIdx = info.endIdx;
          const existingFromHover =
            hoverTooltip?.startIdx === info.startIdx &&
            hoverTooltip?.endIdx === info.endIdx
              ? hoverTooltip.translation
              : undefined;
          const existingFromRanges = underlinedRanges.find(
            (r) =>
              r.startIdx <= info.startIdx &&
              r.endIdx >= info.endIdx &&
              r.translation
          )?.translation;
          const existingTranslation =
            existingFromHover ?? existingFromRanges ?? null;
          scheduleSelectionTooltipReveal(
            existingTranslation != null,
            selectionTooltipRevealTimeoutRef,
            setSelectionTooltipRevealed
          );
          setSelectionTooltip({
            startIdx: info.startIdx,
            endIdx: info.endIdx,
            text,
            initialRect: rect,
            translation: existingTranslation,
            loading: existingTranslation == null,
          });
          setHoverTooltip((prev) =>
            prev &&
            prev.startIdx === info.startIdx &&
            prev.endIdx === info.endIdx
              ? null
              : prev
          );
        }
      }
      if (startIdx === undefined || endIdx === undefined) {
        scheduleSelectionTooltipReveal(
          false,
          selectionTooltipRevealTimeoutRef,
          setSelectionTooltipRevealed
        );
        setSelectionTooltip({
          startIdx: -1,
          endIdx: -1,
          text,
          initialRect: rect,
          translation: null,
          loading: true,
        });
      } else {
        const s = startIdx;
        const e = endIdx;
        const overlapping = underlinedRanges.filter(
          (r) => r.startIdx < e && r.endIdx > s
        );
        if (overlapping.length > 0) {
          translateAbortRef.current?.abort();
        }
        setUnderlinedRanges((prev) => {
          const overlappingPrev = prev.filter(
            (r) => r.startIdx < e && r.endIdx > s
          );
          if (overlappingPrev.length === 0) {
            const duplicate = prev.some(
              (r) => r.startIdx === s && r.endIdx === e
            );
            return duplicate ? prev : [...prev, { startIdx: s, endIdx: e }];
          }
          const mergedStart = Math.min(
            s,
            ...overlappingPrev.map((r) => r.startIdx)
          );
          const mergedEnd = Math.max(
            e,
            ...overlappingPrev.map((r) => r.endIdx)
          );
          const rest = prev.filter((r) => r.startIdx >= e || r.endIdx <= s);
          return [...rest, { startIdx: mergedStart, endIdx: mergedEnd }];
        });
      }
      const controller = new AbortController();
      translateAbortRef.current = controller;
      doTranslate(
        text,
        range,
        container,
        startIdx,
        endIdx,
        controller.signal
      );
    },
    [
      hoverTooltip,
      underlinedRanges,
      setUnderlinedRanges,
      doTranslate,
    ]
  );

  const closeTooltipForRange = useCallback(
    (startIdx: number, endIdx: number, wasSelection: boolean) => {
      isPointerOverTooltipRef.current = false;
      const clearingSelection =
        selectionTooltip?.startIdx === startIdx &&
        selectionTooltip?.endIdx === endIdx;
      if (clearingSelection) {
        if (selectionTooltipRevealTimeoutRef.current) {
          clearTimeout(selectionTooltipRevealTimeoutRef.current);
          selectionTooltipRevealTimeoutRef.current = null;
        }
        setSelectionTooltipRevealed(false);
      }
      setSelectionTooltip((prev) =>
        prev?.startIdx === startIdx && prev?.endIdx === endIdx ? null : prev
      );
      setHoverTooltip((prev) =>
        prev?.startIdx === startIdx && prev?.endIdx === endIdx ? null : prev
      );
      if (wasSelection) {
        rangeRef.current = null;
        tooltipTextRef.current = null;
        const sel = document.getSelection();
        if (sel) sel.removeAllRanges();
      }
      setUnderlinedRanges((prev) =>
        prev.filter((r) => !(r.startIdx === startIdx && r.endIdx === endIdx))
      );
    },
    [selectionTooltip, setUnderlinedRanges]
  );

  const scheduleHoverTooltipClose = useCallback(() => {
    if (hoverTooltipCloseTimeoutRef.current) {
      clearTimeout(hoverTooltipCloseTimeoutRef.current);
      hoverTooltipCloseTimeoutRef.current = null;
    }
    hoverTooltipCloseTimeoutRef.current = setTimeout(() => {
      hoverTooltipCloseTimeoutRef.current = null;
      setHoverTooltip(null);
    }, HOVER_TOOLTIP_CLOSE_MS);
  }, []);

  const handleUnderlineHover = useCallback(
    (
      translation: string,
      rect: DOMRect,
      hoveredRange: { startIdx: number; endIdx: number }
    ) => {
      if (isPointerOverTooltipRef.current) return;
      if (hoverTooltipCloseTimeoutRef.current) {
        clearTimeout(hoverTooltipCloseTimeoutRef.current);
        hoverTooltipCloseTimeoutRef.current = null;
      }
      const range = rangeRef.current;
      const container = contentRef.current;
      if (range && container) {
        const info = getContainerTextAndSelection(container, range);
        if (
          info &&
          info.startIdx === hoveredRange.startIdx &&
          info.endIdx === hoveredRange.endIdx
        ) {
          return;
        }
      }
      setHoverTooltip({
        startIdx: hoveredRange.startIdx,
        endIdx: hoveredRange.endIdx,
        translation,
        initialRect: rect,
      });
    },
    []
  );

  const handleUnderlineLeave = useCallback(
    (hoveredRange?: WordSelectableUnderlinedRange) => {
      if (hoverTooltipCloseTimeoutRef.current) {
        clearTimeout(hoverTooltipCloseTimeoutRef.current);
        hoverTooltipCloseTimeoutRef.current = null;
      }
      if (!hoveredRange?.translation) {
        scheduleHoverTooltipClose();
        return;
      }
      const container = contentRef.current;
      const range = rangeRef.current;
      if (!container || !range) {
        scheduleHoverTooltipClose();
        return;
      }
      const info = getContainerTextAndSelection(container, range);
      if (
        !info ||
        info.startIdx !== hoveredRange.startIdx ||
        info.endIdx !== hoveredRange.endIdx
      ) {
        scheduleHoverTooltipClose();
        return;
      }
      const sel = window.getSelection();
      const selectedText = sel?.rangeCount ? sel.toString().trim() : "";
      if (!selectedText) {
        scheduleHoverTooltipClose();
        return;
      }
      tooltipTextRef.current = selectedText;
      setSelectionTooltipRevealed(true);
      setSelectionTooltip({
        startIdx: hoveredRange.startIdx,
        endIdx: hoveredRange.endIdx,
        text: selectedText,
        initialRect: range.getBoundingClientRect(),
        translation: hoveredRange.translation,
        loading: false,
      });
      setHoverTooltip(null);
    },
    [scheduleHoverTooltipClose]
  );

  const activeRanges: Array<{
    startIdx: number;
    endIdx: number;
    isSelection: boolean;
    initialRect: DOMRect;
    translation: string | null;
    loading: boolean;
  }> = [];
  if (selectionTooltip && selectionTooltipRevealed) {
    activeRanges.push({
      startIdx: selectionTooltip.startIdx,
      endIdx: selectionTooltip.endIdx,
      isSelection: true,
      initialRect: selectionTooltip.initialRect,
      translation: selectionTooltip.translation,
      loading: selectionTooltip.loading,
    });
  }
  if (hoverTooltip) {
    const sameAsSelection =
      selectionTooltip &&
      selectionTooltip.startIdx === hoverTooltip.startIdx &&
      selectionTooltip.endIdx === hoverTooltip.endIdx;
    if (!sameAsSelection) {
      activeRanges.push({
        startIdx: hoverTooltip.startIdx,
        endIdx: hoverTooltip.endIdx,
        isSelection: false,
        initialRect: hoverTooltip.initialRect,
        translation: hoverTooltip.translation,
        loading: false,
      });
    }
  }

  return (
    <>
      <div ref={contentRef}>
        <WordSelectable
          className={className}
          onSelectionForTranslation={handleSelectionForTranslation}
          underlinedRanges={underlinedRanges}
          onUnderlineHover={handleUnderlineHover}
          onUnderlineLeave={handleUnderlineLeave}
        >
          {children}
        </WordSelectable>
      </div>
      {activeRanges.map((entry) => {
        const isSelection = entry.isSelection;
        return (
          <div
            key={`${entry.startIdx}-${entry.endIdx}`}
            ref={isSelection ? selectionTooltipRef : undefined}
            data-translation-tooltip
            className="fixed z-[100] p-2"
            style={{
              ...getTranslationTooltipPosition(entry.initialRect),
              pointerEvents: "auto",
            }}
            onMouseEnter={() => {
              tooltipHoveredRef.current = true;
              isPointerOverTooltipRef.current = true;
              if (!isSelection && hoverTooltipCloseTimeoutRef.current) {
                clearTimeout(hoverTooltipCloseTimeoutRef.current);
                hoverTooltipCloseTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              tooltipHoveredRef.current = false;
              isPointerOverTooltipRef.current = false;
              if (!isSelection) scheduleHoverTooltipClose();
            }}
          >
            <div className="group relative">
              <div className="rounded-lg border bg-popover px-3 py-2 shadow-md">
                {entry.loading ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Translating...
                  </span>
                ) : (
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&>*]:my-0">
                    <ReactMarkdown>{entry.translation ?? ""}</ReactMarkdown>
                  </div>
                )}
              </div>
              {!entry.loading && (
                <button
                  type="button"
                  aria-label="Close tooltip and remove range"
                  className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-popover shadow-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTooltipForRange(
                      entry.startIdx,
                      entry.endIdx,
                      isSelection
                    );
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
