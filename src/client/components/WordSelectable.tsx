import { useRef, useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getContainerPositions,
  getIndicesForRange,
  getRangeForIndices,
  getRangeRectsInContainer,
} from "@/lib/contentRanges";

/** Get a Range at (x, y). Uses caretRangeFromPoint with caretPositionFromPoint fallback for Firefox. */
function rangeFromPoint(document: Document, x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  const pos = (document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.setEnd(pos.offsetNode, pos.offset);
  return range;
}

/**
 * True if the character is part of a word (best effort for EN, DE, FR, ES, CA).
 * Includes: letters, digits, combining marks; apostrophe variants (don't, l'autre);
 * hyphen (well-being, compounds); Catalan middle dot (l·l).
 */
function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}\p{M}'\u2019\u02BC\u00B7-]/u.test(c);
}

/** Expand range to word boundaries, ignoring punctuation (only letters, digits, apostrophe). Modifies range in place. */
function expandToWordBoundaries(range: Range): boolean {
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  if (startNode.nodeType !== Node.TEXT_NODE || endNode.nodeType !== Node.TEXT_NODE) {
    return false;
  }
  const startText = startNode.textContent ?? "";
  const endText = endNode.textContent ?? "";
  let start = range.startOffset;
  let end = range.endOffset;

  while (start > 0 && isWordChar(startText[start - 1]!)) start--;
  while (end < endText.length && isWordChar(endText[end]!)) end++;

  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  return true;
}

/** Return a new range that covers both a and b in document order. */
function rangeUnion(a: Range, b: Range): Range {
  const r = a.cloneRange();
  if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
    r.setStart(a.startContainer, a.startOffset);
  } else {
    r.setStart(b.startContainer, b.startOffset);
  }
  if (a.compareBoundaryPoints(Range.END_TO_END, b) >= 0) {
    r.setEnd(a.endContainer, a.endOffset);
  } else {
    r.setEnd(b.endContainer, b.endOffset);
  }
  return r;
}

/** True if the collapsed range is at a word boundary (whitespace, punctuation, or start/end of text). */
function isAtWordBoundary(range: Range): boolean {
  if (!range.collapsed) return false;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent ?? "";
  const offset = range.startOffset;
  if (offset === 0 || offset === text.length) return true;
  const before = text[offset - 1];
  const at = text[offset];
  return before !== undefined && (!isWordChar(before) || (at !== undefined && !isWordChar(at)));
}

/** Get word range at client coordinates, or null if not in a text node. */
function getWordRangeAtPoint(doc: Document, clientX: number, clientY: number): Range | null {
  const range = rangeFromPoint(doc, clientX, clientY);
  if (!range) return null;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const expanded = range.cloneRange();
  if (!expandToWordBoundaries(expanded)) return null;
  return expanded;
}

/** Clamp range to the contents of container; returns a new range. */
function clampRangeToContainer(range: Range, container: Node): Range {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return range.cloneRange();
  const bounds = doc.createRange();
  bounds.selectNodeContents(container);
  const clamped = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
    clamped.setStart(bounds.startContainer, bounds.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
    clamped.setEnd(bounds.endContainer, bounds.endOffset);
  }
  return clamped;
}

/** True if the string contains at least one letter (so we consider it "at least one word"). */
function hasWordChar(s: string): boolean {
  return /\p{L}/u.test(s);
}

/** Get character index at (clientX, clientY) in container, or null if not in a text node. */
function getIndexAtPoint(
  container: Node,
  clientX: number,
  clientY: number
): number | null {
  const doc = container.ownerDocument;
  if (!doc) return null;
  const range = rangeFromPoint(doc, clientX, clientY);
  if (!range) return null;
  const positions = getContainerPositions(container);
  if (positions.length === 0) return null;
  const node = range.startContainer;
  const offset = range.startOffset;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    if (p.node === node && p.offset === offset) return i;
  }
  for (let i = 0; i < positions.length; i++) {
    if (positions[i]!.node === node && offset <= positions[i]!.offset) return i;
  }
  if (positions[positions.length - 1]!.node === node) return positions.length - 1;
  return null;
}

export interface UnderlinedRange {
  startIdx: number;
  endIdx: number;
  /** When set, hovering this range shows the translation tooltip. */
  translation?: string;
}

interface WordSelectableProps {
  children: React.ReactNode;
  className?: string;
  /** Called on mouseup when the selection is non-empty and contains at least one word. Receives the Range so the parent can track position (e.g. on scroll). */
  onSelectionForTranslation?: (text: string, rect: DOMRect, range: Range) => void;
  /** Ranges (character indices in this block's text) to underline. Only computed when this component is in the viewport. */
  underlinedRanges?: UnderlinedRange[];
  /** Called when the pointer enters an underlined range that has a translation. Receives range so parent can avoid duplicating the selection tooltip. */
  onUnderlineHover?: (
    translation: string,
    rect: DOMRect,
    range: UnderlinedRange
  ) => void;
  /** Called when the pointer leaves an underlined range. Receives the range that was hovered so the parent can keep the tooltip open if that range is now selected. */
  onUnderlineLeave?: (hoveredRange?: UnderlinedRange) => void;
}

/**
 * Wraps content and provides word-based selection: mousedown selects the word under
 * the cursor; dragging expands selection by words. Uses native Selection so copy/paste works.
 */
export function WordSelectable({
  children,
  className,
  onSelectionForTranslation,
  underlinedRanges = [],
  onUnderlineHover,
  onUnderlineLeave,
}: WordSelectableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRangeRef = useRef<Range | null>(null);
  const isDraggingRef = useRef(false);
  const hoveredRangeRef = useRef<UnderlinedRange | null>(null);
  const [underlineRects, setUnderlineRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  const isInViewRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const container = e.currentTarget as HTMLDivElement;
      const doc = container.ownerDocument;
      const win = doc.defaultView;
      const rawRange = rangeFromPoint(doc, e.clientX, e.clientY);
      if (!rawRange || !win) return;
      const node = rawRange.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;

      const atBoundary = isAtWordBoundary(rawRange);
      let range = atBoundary ? null : getWordRangeAtPoint(doc, e.clientX, e.clientY);

      if (range && underlinedRanges.length > 0) {
        const indices = getIndicesForRange(container, range);
        if (indices) {
          const containing = underlinedRanges.find(
            (ur) => ur.startIdx <= indices.startIdx && ur.endIdx >= indices.endIdx
          );
          if (containing) {
            const fullRange = getRangeForIndices(
              container,
              containing.startIdx,
              containing.endIdx
            );
            if (fullRange) range = fullRange;
          }
        }
      }

      const sel = win.getSelection();
      if (!sel) return;

      if (atBoundary) {
        anchorRangeRef.current = rawRange;
        e.preventDefault();
      } else if (range) {
        anchorRangeRef.current = range;
        const toSelect = clampRangeToContainer(range, container);
        sel.removeAllRanges();
        sel.addRange(toSelect);
        e.preventDefault();
      } else {
        return;
      }

      isDraggingRef.current = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!anchorRangeRef.current || !containerRef.current) return;
        const container = containerRef.current;
        const wordRange = getWordRangeAtPoint(doc, moveEvent.clientX, moveEvent.clientY);
        if (!wordRange) return;
        let union = rangeUnion(anchorRangeRef.current, wordRange);
        if (underlinedRanges.length > 0) {
          const indices = getIndicesForRange(container, union);
          if (indices) {
            const overlapping = underlinedRanges.filter(
              (r) => r.startIdx < indices.endIdx && r.endIdx > indices.startIdx
            );
            if (overlapping.length > 0) {
              const mergedStart = Math.min(
                indices.startIdx,
                ...overlapping.map((r) => r.startIdx)
              );
              const mergedEnd = Math.max(
                indices.endIdx,
                ...overlapping.map((r) => r.endIdx)
              );
              const expandedRange = getRangeForIndices(
                container,
                mergedStart,
                mergedEnd
              );
              if (expandedRange) union = expandedRange;
            }
          }
        }
        const toSelect = clampRangeToContainer(union, container);
        const s = win.getSelection();
        if (!s) return;
        s.removeAllRanges();
        s.addRange(toSelect);
      };

      const handleMouseUp = () => {
        if (onSelectionForTranslation) {
          const s = win.getSelection();
          if (s && s.rangeCount > 0) {
            let range = s.getRangeAt(0);
            const container = containerRef.current;
            if (container && underlinedRanges.length > 0) {
              const indices = getIndicesForRange(container, range);
              if (indices) {
                const overlapping = underlinedRanges.filter(
                  (r) => r.startIdx < indices.endIdx && r.endIdx > indices.startIdx
                );
                if (overlapping.length > 0) {
                  const mergedStart = Math.min(
                    indices.startIdx,
                    ...overlapping.map((r) => r.startIdx)
                  );
                  const mergedEnd = Math.max(
                    indices.endIdx,
                    ...overlapping.map((r) => r.endIdx)
                  );
                  const expandedRange = getRangeForIndices(
                    container,
                    mergedStart,
                    mergedEnd
                  );
                  if (expandedRange) {
                    range = expandedRange;
                    s.removeAllRanges();
                    s.addRange(range);
                  }
                }
              }
            }
            const text = range.toString().trim();
            if (text && hasWordChar(text)) {
              const rect = range.getBoundingClientRect();
              onSelectionForTranslation(text, rect, range);
            }
          }
        }
        isDraggingRef.current = false;
        anchorRangeRef.current = null;
        doc.removeEventListener("mousemove", handleMouseMove);
        doc.removeEventListener("mouseup", handleMouseUp, true);
        doc.removeEventListener("dragstart", handleDragStart, true);
      };

      const handleDragStart = (dragEvent: DragEvent) => {
        dragEvent.preventDefault();
        dragEvent.stopPropagation();
      };

      doc.addEventListener("mousemove", handleMouseMove);
      doc.addEventListener("mouseup", handleMouseUp, true);
      doc.addEventListener("dragstart", handleDragStart, true);
    },
    [underlinedRanges]
  );

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!onUnderlineHover || !onUnderlineLeave || underlinedRanges.length === 0) return;
      if (isDraggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const index = getIndexAtPoint(container, e.clientX, e.clientY);
      if (index === null) {
        if (hoveredRangeRef.current) {
          const prev = hoveredRangeRef.current;
          hoveredRangeRef.current = null;
          onUnderlineLeave(prev);
        }
        return;
      }
      const rangeWithTranslation = underlinedRanges.find(
        (r) => r.translation && index >= r.startIdx && index < r.endIdx
      );
      if (!rangeWithTranslation) {
        if (hoveredRangeRef.current) {
          const prev = hoveredRangeRef.current;
          hoveredRangeRef.current = null;
          onUnderlineLeave(prev);
        }
        return;
      }
      if (
        hoveredRangeRef.current === rangeWithTranslation &&
        hoveredRangeRef.current.startIdx === rangeWithTranslation.startIdx
      ) {
        return;
      }
      hoveredRangeRef.current = rangeWithTranslation;
      const positions = getContainerPositions(container);
      const doc = container.ownerDocument;
      if (!doc) return;
      const startPos = positions[rangeWithTranslation.startIdx]!;
      const endPos = positions[rangeWithTranslation.endIdx - 1]!;
      const r = doc.createRange();
      r.setStart(startPos.node, startPos.offset);
      r.setEnd(endPos.node, endPos.offset + 1);
      const rect = r.getBoundingClientRect();
      onUnderlineHover(
        rangeWithTranslation.translation!,
        rect,
        rangeWithTranslation
      );
    },
    [underlinedRanges, onUnderlineHover, onUnderlineLeave]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoveredRangeRef.current && onUnderlineLeave) {
      const prev = hoveredRangeRef.current;
      hoveredRangeRef.current = null;
      onUnderlineLeave(prev);
    }
  }, [onUnderlineLeave]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || underlinedRanges.length === 0) {
      setUnderlineRects([]);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isInViewRef.current = entry.isIntersecting;
        if (!entry.isIntersecting) {
          setUnderlineRects([]);
          return;
        }
        scheduleUpdate();
      },
      { rootMargin: "100px", threshold: 0 }
    );
    io.observe(container);

    let rafScheduled = false;
    const updateRects = () => {
      if (!containerRef.current || !isInViewRef.current) return;
      const positions = getContainerPositions(containerRef.current);
      const rects = underlinedRanges.flatMap((r) =>
        getRangeRectsInContainer(
          containerRef.current!,
          r.startIdx,
          r.endIdx,
          positions
        )
      );
      setUnderlineRects(rects);
    };
    const scheduleUpdate = () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        if (isInViewRef.current) updateRects();
      });
    };
    const win = container.ownerDocument?.defaultView;
    if (win) {
      win.addEventListener("scroll", scheduleUpdate, true);
      win.addEventListener("resize", scheduleUpdate);
    }
    return () => {
      io.disconnect();
      if (win) {
        win.removeEventListener("scroll", scheduleUpdate, true);
        win.removeEventListener("resize", scheduleUpdate);
      }
    };
  }, [underlinedRanges]);

  return (
    <div
      ref={containerRef}
      className={cn("relative cursor-text select-text", className)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDragStart={handleDragStart}
    >
      {underlineRects.map((rect, i) => (
        <div
          key={i}
          className="pointer-events-none absolute z-0 border-b-2 border-[#9ed8ff]"
          style={{
            left: rect.left,
            top: rect.top + rect.height - 2,
            width: rect.width,
            height: 2,
          }}
          aria-hidden
        />
      ))}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
