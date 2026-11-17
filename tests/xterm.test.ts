import { expect, test } from "bun:test";
import { Terminal, type ILink, type ILinkProvider } from "@xterm/xterm";
import { installTerminalInteractions, terminalLineAt } from "../src/mainview/terminal-interactions";
import { terminalTokenAt } from "../src/shared/terminal-tokens";

async function withTerminal(cols: number, output: string, check: (terminal: Terminal) => void) {
  const terminal = new Terminal({ cols, rows: 5, allowProposedApi: true });
  try {
    await new Promise<void>((resolve) => terminal.write(output, resolve));
    check(terminal);
  } finally {
    terminal.dispose();
  }
}

test("xterm links span soft wraps without joining separate output lines", async () => {
  const url = "https://example.com/long/path?q=1";
  await withTerminal(12, `${url}\r\nnext line`, (terminal) => {
    const line = terminalLineAt(terminal, 1)!;
    expect(line.text).toBe(url);
    expect(terminalTokenAt(line.text, 15)?.text).toBe(url);
    expect(line.cells.find((cell) => cell.start === 12)).toMatchObject({ x: 0, y: 1 });
    expect(terminalLineAt(terminal, 3)?.text).toBe("next line");
  });
});

test("xterm token offsets account for wide, combined and surrogate characters", async () => {
  await withTerminal(40, "界𝄞e\u0301 src/main.ts:42", (terminal) => {
    const line = terminalLineAt(terminal, 0)!;
    expect(line.text).toBe("界𝄞e\u0301 src/main.ts:42");
    const start = line.text.indexOf("src");
    expect(line.cells.find((cell) => cell.start === start)).toMatchObject({ x: 5, y: 0 });
    expect(terminalTokenAt(line.text, start)?.text).toBe("src/main.ts:42");
    expect(line.cells[0]).toMatchObject({ width: 2, start: 0, end: 1 });
    expect(line.cells[1]).toMatchObject({ width: 1, start: 1, end: 3 });
    expect(line.cells[2]).toMatchObject({ width: 1, start: 3, end: 5 });
  });
});

test("xterm interaction mapping reads retained scrollback", async () => {
  await withTerminal(20, "src/first.ts:7\r\n1\r\n2\r\n3\r\n4\r\n5", (terminal) => {
    expect(terminal.buffer.active.baseY).toBeGreaterThan(0);
    expect(terminalLineAt(terminal, 0)?.text).toBe("src/first.ts:7");
    expect(terminalLineAt(terminal, 100)).toBeNull();
  });
});

test("xterm link provider preserves wrapped ranges and requires modified clicks", async () => {
  await withTerminal(20, 'See https://example.com and "./src/main.ts:42"', (terminal) => {
    let provider: ILinkProvider | undefined;
    let disposed = false;
    const opened: string[] = [];
    const view = {
      buffer: terminal.buffer,
      cols: terminal.cols,
      element: Object.assign(new EventTarget(), { removeAttribute() {} }),
      options: { linkHandler: undefined },
      registerLinkProvider(value: ILinkProvider) {
        provider = value;
        return {
          dispose() {
            disposed = true;
          },
        };
      },
    } as unknown as Terminal;
    const cleanup = installTerminalInteractions(view, (target) => opened.push(target));
    let links: ILink[] = [];
    provider!.provideLinks(1, (value) => {
      links = value ?? [];
    });
    expect(links.map((link) => link.text)).toEqual(["https://example.com"]);
    expect(links[0].range).toEqual({ start: { x: 5, y: 1 }, end: { x: 3, y: 2 } });
    const event = { button: 0, detail: 1, ctrlKey: false, metaKey: false, preventDefault() {} };
    links[0].activate(event as MouseEvent, links[0].text);
    expect(opened).toEqual([]);
    event.ctrlKey = event.metaKey = true;
    links[0].activate(event as MouseEvent, links[0].text);
    expect(opened).toEqual(["https://example.com"]);
    provider!.provideLinks(3, (value) => {
      links = value ?? [];
    });
    expect(links.map((link) => link.text)).toEqual(["./src/main.ts:42"]);
    view.options.linkHandler!.activate(event as MouseEvent, "https://osc.example", links[0].range);
    expect(opened.at(-1)).toBe("https://osc.example");
    cleanup();
    expect(disposed).toBe(true);
    expect(view.options.linkHandler).toBeUndefined();
  });
});
