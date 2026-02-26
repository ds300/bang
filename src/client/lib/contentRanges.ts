/** Build flat list of (node, offset) for every character in container (document order). */
export function getContainerPositions(
  container: Node
): { node: Text; offset: number }[] {
  const doc = container.ownerDocument;
  if (!doc) return [];
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const positions: { node: Text; offset: number }[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      positions.push({ node, offset: i });
    }
  }
  return positions;
}

/** Full plain text of the container (all text nodes in document order). */
export function getContainerText(container: Node): string {
  const positions = getContainerPositions(container);
  return positions
    .map((p) => (p.node.textContent ?? "")[p.offset] ?? "")
    .join("");
}

/** Character indices and full container text for a Range (for translation context). */
export function getContainerTextAndSelection(
  container: Node,
  range: Range
): { containerText: string; startIdx: number; endIdx: number } | null {
  const indices = getIndicesForRange(container, range);
  if (!indices) return null;
  const containerText = getContainerText(container);
  return { ...indices, containerText };
}

/** Get character indices (startIdx, endIdx) for a DOM Range within the container. */
export function getIndicesForRange(
  container: Node,
  range: Range
): { startIdx: number; endIdx: number } | null {
  const positions = getContainerPositions(container);
  if (positions.length === 0) return null;
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    if (p.node === range.startContainer && p.offset === range.startOffset)
      startIdx = i;
    if (p.node === range.endContainer && p.offset === range.endOffset - 1)
      endIdx = i + 1;
  }
  if (startIdx === -1) {
    for (let i = 0; i < positions.length; i++) {
      if (
        positions[i]!.node === range.startContainer &&
        range.startOffset <= positions[i]!.offset
      ) {
        startIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    for (let i = positions.length - 1; i >= 0; i--) {
      if (
        positions[i]!.node === range.endContainer &&
        positions[i]!.offset < range.endOffset
      ) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (startIdx < 0 || endIdx <= startIdx) return null;
  return { startIdx, endIdx };
}

/** Create a DOM Range for character indices [startIdx, endIdx) within the container. */
export function getRangeForIndices(
  container: Node,
  startIdx: number,
  endIdx: number
): Range | null {
  const positions = getContainerPositions(container);
  if (startIdx < 0 || endIdx <= startIdx || endIdx > positions.length)
    return null;
  const doc = container.ownerDocument;
  if (!doc) return null;
  const startPos = positions[startIdx]!;
  const endPos = positions[endIdx - 1]!;
  const r = doc.createRange();
  r.setStart(startPos.node, startPos.offset);
  r.setEnd(endPos.node, endPos.offset + 1);
  return r;
}

