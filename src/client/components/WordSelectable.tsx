import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

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

interface WordSelectableProps {
  children: React.ReactNode;
  className?: string;
  /** Called on mouseup when the selection is non-empty and contains at least one word. Receives the Range so the parent can track position (e.g. on scroll). */
  onSelectionForTranslation?: (text: string, rect: DOMRect, range: Range) => void;
}

/**
 * Wraps content and provides word-based selection: mousedown selects the word under
 * the cursor; dragging expands selection by words. Uses native Selection so copy/paste works.
 */
export function WordSelectable({ children, className, onSelectionForTranslation }: WordSelectableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRangeRef = useRef<Range | null>(null);
  const isDraggingRef = useRef(false);

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
        const wordRange = getWordRangeAtPoint(doc, moveEvent.clientX, moveEvent.clientY);
        if (!wordRange) return;
        const union = rangeUnion(anchorRangeRef.current, wordRange);
        const toSelect = clampRangeToContainer(union, containerRef.current);
        const s = win.getSelection();
        if (!s) return;
        s.removeAllRanges();
        s.addRange(toSelect);
      };

      const handleMouseUp = () => {
        if (onSelectionForTranslation) {
          const s = win.getSelection();
          if (s && s.rangeCount > 0) {
            const text = s.toString().trim();
            if (text && hasWordChar(text)) {
              const range = s.getRangeAt(0);
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
    []
  );

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("cursor-text select-text", className)}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
    >
      {children}
    </div>
  );
}
