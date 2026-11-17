import type { Terminal, ILink } from "@xterm/xterm";
import { terminalTokenAt } from "../shared/terminal-tokens";

/** Map UTF-16 token offsets to buffer cells, including wide and combined characters. */
export function terminalLineAt(terminal: Pick<Terminal, "buffer" | "cols">, row: number) {
  const buffer = terminal.buffer.active;
  if (!buffer.getLine(row)) return null;
  let first = row;
  let last = row;
  while (first > 0 && row - first < 64 && buffer.getLine(first)?.isWrapped) first--;
  while (last - first < 64 && buffer.getLine(last + 1)?.isWrapped) last++;
  let text = "";
  const cells: { x: number; y: number; width: number; start: number; end: number }[] = [];
  for (let y = first; y <= last; y++) {
    const line = buffer.getLine(y)!;
    const length = line.translateToString(y === last).length;
    let lineLength = 0;
    for (let x = 0; x < terminal.cols && lineLength < length; x++) {
      const cell = line.getCell(x);
      const width = cell?.getWidth() ?? 0;
      if (!width) continue;
      const chars = cell!.getChars() || " ";
      cells.push({ x, y, width, start: text.length, end: text.length + chars.length });
      text += chars;
      lineLength += chars.length;
    }
    if (text.length > 16_384) return null;
  }
  return { text, cells };
}

function hitAt(terminal: Terminal, event: MouseEvent) {
  const screen = terminal.element?.querySelector(".xterm-screen");
  if (!screen || !(event.target instanceof Node) || !screen.contains(event.target)) return null;
  const rect = screen.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * terminal.cols);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * terminal.rows);
  if (x < 0 || x >= terminal.cols || y < 0 || y >= terminal.rows) return null;
  const row = terminal.buffer.active.viewportY + y;
  const line = terminalLineAt(terminal, row);
  const cell = line?.cells.find((cell) => cell.y === row && x >= cell.x && x < cell.x + cell.width);
  if (!line || !cell) return null;
  const token = terminalTokenAt(line.text, cell.start);
  if (!token) return null;
  const start = line.cells.find((cell) => cell.end > token.start);
  const end = line.cells.find((cell) => cell.end >= token.end);
  return start && end ? { start, end, live: row >= terminal.buffer.active.baseY } : null;
}

export function installTerminalInteractions(terminal: Terminal, open: (target: string) => void) {
  const element = terminal.element!;
  const modified = (event: MouseEvent) =>
    /Mac/i.test(navigator.platform) ? event.metaKey : event.ctrlKey;
  const activate = (event: MouseEvent, target: string) => {
    if (event.button !== 0 || (!modified(event) && event.detail !== 0)) return;
    event.preventDefault();
    open(target);
  };
  const hover = (_event: MouseEvent, target: string) => {
    element.title = `${target} (Ctrl/Cmd+click)`;
  };
  const leave = () => element.removeAttribute("title");
  const previousLinkHandler = terminal.options.linkHandler;
  terminal.options.linkHandler = { activate, hover, leave, allowNonHttpProtocols: true };
  const provider = terminal.registerLinkProvider({
    provideLinks(row, callback) {
      const line = terminalLineAt(terminal, row - 1);
      if (!line) return callback(undefined);
      const links: ILink[] = [];
      const plainText = /[\w\s-]+/y;
      for (let offset = 0; offset < line.text.length;) {
        const token = terminalTokenAt(line.text, offset);
        if (!token) {
          plainText.lastIndex = offset;
          offset += plainText.exec(line.text)?.[0].length || 1;
          continue;
        }
        offset = token.end;
        if (token.kind !== "url" && token.kind !== "path") continue;
        const start = line.cells.find((cell) => cell.end > token.start)!;
        const end = line.cells.find((cell) => cell.end >= token.end)!;
        if (row - 1 < start.y || row - 1 > end.y) continue;
        links.push({
          text: token.text,
          range: {
            start: { x: start.x + 1, y: start.y + 1 },
            end: { x: end.x + end.width, y: end.y + 1 },
          },
          activate,
          hover,
          leave,
        });
      }
      callback(links);
    },
  });
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail !== 2 || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const hit = hitAt(terminal, event);
    if (!hit || (!event.shiftKey && hit.live && terminal.modes.mouseTrackingMode !== "none"))
      return;
    const { start, end } = hit;
    terminal.select(
      start.x,
      start.y,
      (end.y - start.y) * terminal.cols + end.x + end.width - start.x,
    );
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener("mousedown", onMouseDown, true);
  return () => {
    provider.dispose();
    terminal.options.linkHandler = previousLinkHandler;
    element.removeEventListener("mousedown", onMouseDown, true);
    leave();
  };
}
