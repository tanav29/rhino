import type { WTerm } from "@wterm/dom";
import { terminalTokenAt } from "../shared/terminal-tokens";

type MountedRow = { element: HTMLElement; row: number; text: string };

function textPoint(element: HTMLElement, offset: number): [Node, number] | null {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) return [node, offset];
    offset -= length;
  }
  return null;
}

/** Use the painted DOM for text and core metadata only for confirmed soft wraps. */
function hitAt(terminal: WTerm, event: MouseEvent) {
  const core = terminal.bridge;
  const target = event.target instanceof Element ? event.target : null;
  const rowElement = target?.closest<HTMLElement>(".term-row");
  const grid = rowElement?.parentElement;
  if (!core || !rowElement || !grid || !terminal.element.contains(grid)) return null;
  const doc = grid.ownerDocument;
  const caretDoc = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = caretDoc.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = caretDoc.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = caret?.offsetNode ?? range?.startContainer;
  const offset = caret?.offset ?? range?.startOffset;
  if (!node || offset === undefined || !rowElement.contains(node)) return null;
  const before = doc.createRange();
  before.selectNodeContents(rowElement);
  before.setEnd(node, offset);
  let textOffset = before.toString().length;
  // Caret APIs pick the nearest boundary. Resolve the character under the
  // pointer, including the right half of the final character in a token.
  if (textOffset > 0) {
    const start = textPoint(rowElement, textOffset - 1);
    const end = textPoint(rowElement, textOffset);
    if (start && end) {
      const previous = doc.createRange();
      previous.setStart(...start);
      previous.setEnd(...end);
      const rect = previous.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX < rect.right) textOffset--;
    }
  }

  const mounted: MountedRow[] = [];
  const rowHeight = parseFloat(
    getComputedStyle(terminal.element).getPropertyValue("--term-row-height"),
  );
  if (!(rowHeight > 0)) return null;
  let row = 0;
  for (const child of grid.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains("term-scrollback-spacer"))
      row += Math.round(parseFloat(child.style.height || "0") / rowHeight);
    else if (child.classList.contains("term-row"))
      mounted.push({ element: child, row: row++, text: child.textContent ?? "" });
  }
  const index = mounted.findIndex((item) => item.element === rowElement);
  if (index < 0) return null;
  const scrollback = core.getScrollbackCount();
  const metadata = (retainedRow: number) =>
    retainedRow < scrollback
      ? core.getScrollbackRowMetadata?.(scrollback - retainedRow - 1)
      : core.getRowMetadata?.(retainedRow - scrollback);
  const wraps = (a: MountedRow, b: MountedRow) =>
    b.row === a.row + 1 && metadata(a.row)?.wrapsToNext && metadata(b.row)?.continuesPrevious;
  let first = index,
    last = index;
  while (first > 0 && index - first < 64 && wraps(mounted[first - 1], mounted[first])) first--;
  while (last + 1 < mounted.length && last - first < 64 && wraps(mounted[last], mounted[last + 1]))
    last++;
  const rows = mounted.slice(first, last + 1);
  const text = rows.map((item) => item.text).join("");
  if (text.length > 16_384) return null;
  const logicalOffset =
    rows.slice(0, index - first).reduce((sum, item) => sum + item.text.length, 0) + textOffset;
  let remaining = textOffset;
  let link: string | undefined;
  for (let col = 0; col < terminal.cols; col++) {
    const cell =
      mounted[index].row < scrollback
        ? core.getScrollbackCell(scrollback - mounted[index].row - 1, col)
        : core.getCell(mounted[index].row - scrollback, col);
    if (cell.width === 0) continue;
    const length = (cell.chars ?? String.fromCodePoint(cell.char || 32)).length;
    if (remaining < length) {
      link = cell.linkUri;
      break;
    }
    remaining -= length;
  }
  const token = terminalTokenAt(text, logicalOffset);
  const point = (at: number): [Node, number] | null => {
    for (const item of rows) {
      if (at <= item.text.length) return textPoint(item.element, at);
      at -= item.text.length;
    }
    return null;
  };
  return { token, link, point, live: mounted[index].row >= scrollback };
}

export function installTerminalInteractions(terminal: WTerm, open: (target: string) => void) {
  const element = terminal.element;
  const modified = (event: MouseEvent) =>
    /Mac/i.test(navigator.platform) ? event.metaKey : event.ctrlKey;
  const linkAt = (event: MouseEvent) => {
    const anchor =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a.term-link")
        : null;
    if (anchor) return anchor.href;
    const hit = hitAt(terminal, event);
    return (
      hit?.link ?? (hit?.token && ["url", "path"].includes(hit.token.kind) ? hit.token.text : null)
    );
  };
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (modified(event) || event.detail === 0) {
      const link = linkAt(event);
      if (link) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(link);
      }
    }
  };
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 0 && modified(event) && linkAt(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const onSelection = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail !== 2 || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const hit = hitAt(terminal, event);
    if (!hit?.token || (!event.shiftKey && hit.live && terminal.bridge?.mouseTracking?.())) return;
    const start = hit.point(hit.token.start),
      end = hit.point(hit.token.end);
    if (!start || !end) return;
    terminal.clearSelection();
    const active = element.ownerDocument.activeElement;
    if (active instanceof HTMLElement && element.contains(active)) active.blur();
    element.ownerDocument.getSelection()?.setBaseAndExtent(...start, ...end);
    event.preventDefault();
  };
  const onMove = (event: MouseEvent) => {
    const link = modified(event) ? linkAt(event) : null;
    element.toggleAttribute("data-link-hover", !!link);
    if (link) element.title = `${link} (Ctrl/Cmd+click)`;
    else element.removeAttribute("title");
  };
  const clearHover = () => {
    element.removeAttribute("data-link-hover");
    element.removeAttribute("title");
  };
  element.addEventListener("click", onClick, true);
  element.addEventListener("mousedown", onMouseDown, true);
  element.addEventListener("click", onSelection);
  element.addEventListener("mousemove", onMove);
  element.addEventListener("mouseleave", clearHover);
  element.ownerDocument.addEventListener("keyup", clearHover);
  element.ownerDocument.defaultView?.addEventListener("blur", clearHover);
  return () => {
    element.removeEventListener("click", onClick, true);
    element.removeEventListener("mousedown", onMouseDown, true);
    element.removeEventListener("click", onSelection);
    element.removeEventListener("mousemove", onMove);
    element.removeEventListener("mouseleave", clearHover);
    element.ownerDocument.removeEventListener("keyup", clearHover);
    element.ownerDocument.defaultView?.removeEventListener("blur", clearHover);
    clearHover();
  };
}
