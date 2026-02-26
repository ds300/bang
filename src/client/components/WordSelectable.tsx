import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getIndicesForRange, getRangeForIndices } from "@/lib/contentRanges";

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
  /** Ranges (character indices in this block's text) to underline. */
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
  const orderedRanges = [...underlinedRanges].sort(
    (a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx
  );

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
    [onSelectionForTranslation, underlinedRanges]
  );

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      if (!onUnderlineHover || !onUnderlineLeave || orderedRanges.length === 0) return;
      if (isDraggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const rangeEl = (e.target as HTMLElement | null)?.closest?.(
        "[data-underline-range='true']"
      ) as HTMLElement | null;
      if (!rangeEl || !container.contains(rangeEl)) return;

      const startIdx = Number(rangeEl.dataset.rangeStart);
      const endIdx = Number(rangeEl.dataset.rangeEnd);
      if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx)) return;

      const rangeWithTranslation = orderedRanges.find(
        (range) =>
          range.translation &&
          range.startIdx === startIdx &&
          range.endIdx === endIdx
      );
      if (!rangeWithTranslation) return;

      if (
        hoveredRangeRef.current &&
        hoveredRangeRef.current.startIdx === rangeWithTranslation.startIdx &&
        hoveredRangeRef.current.endIdx === rangeWithTranslation.endIdx
      ) {
        return;
      }

      if (hoveredRangeRef.current) {
        onUnderlineLeave(hoveredRangeRef.current);
      }
      hoveredRangeRef.current = rangeWithTranslation;

      const rect =
        getRangeForIndices(container, startIdx, endIdx)?.getBoundingClientRect() ??
        rangeEl.getBoundingClientRect();
      onUnderlineHover(rangeWithTranslation.translation!, rect, rangeWithTranslation);
    },
    [orderedRanges, onUnderlineHover, onUnderlineLeave]
  );

  const handleMouseOut = useCallback(
    (e: React.MouseEvent) => {
      if (!onUnderlineLeave) return;
      const fromEl = (e.target as HTMLElement | null)?.closest?.(
        "[data-underline-range='true']"
      ) as HTMLElement | null;
      if (!fromEl) return;
      const fromStart = Number(fromEl.dataset.rangeStart);
      const fromEnd = Number(fromEl.dataset.rangeEnd);
      if (!Number.isFinite(fromStart) || !Number.isFinite(fromEnd)) return;

      const toEl = (e.relatedTarget as HTMLElement | null)?.closest?.(
        "[data-underline-range='true']"
      ) as HTMLElement | null;
      const toStart = Number(toEl?.dataset.rangeStart);
      const toEnd = Number(toEl?.dataset.rangeEnd);
      if (Number.isFinite(toStart) && Number.isFinite(toEnd)) {
        if (toStart === fromStart && toEnd === fromEnd) return;
      }

      if (
        hoveredRangeRef.current &&
        hoveredRangeRef.current.startIdx === fromStart &&
        hoveredRangeRef.current.endIdx === fromEnd
      ) {
        const prev = hoveredRangeRef.current;
        hoveredRangeRef.current = null;
        onUnderlineLeave(prev);
      }
    },
    [onUnderlineLeave]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative cursor-text select-text", className)}
      onMouseDown={handleMouseDown}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      onDragStart={handleDragStart}
    >
      {children}
    </div>
  );
}
