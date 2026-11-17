import { expect, test } from "bun:test";
import { createTerminalOutputWriter } from "../src/mainview/terminal-output";

test("attachment writes replay before live output and removes overlapping chunks", () => {
  const writes: string[] = [];
  const writer = createTerminalOutputWriter((data) => writes.push(data));
  writer.output({ data: "history", offset: 7 });
  writer.output({ data: " plus live", offset: 17 });
  expect(writes).toEqual([]);
  writer.attach("history plus", 12);
  expect(writes.join("")).toBe("history plus live");
  // A coalesced flush can arrive after attach with text already included in replay.
  writer.output({ data: " plus live", offset: 17 });
  writer.output({ data: "!", offset: 18 });
  expect(writes.join("")).toBe("history plus live!");
});

test("replay filtering and truncation do not change the raw output position", () => {
  const writes: string[] = [];
  const writer = createTerminalOutputWriter((data) => writes.push(data));
  writer.output({ data: "\x1b[6nhello", offset: 100 });
  writer.attach("hello", 100);
  writer.output({ data: "hello world", offset: 106 });
  expect(writes.join("")).toBe("hello world");
});

test("new sessions and older backends keep output arriving during attachment", () => {
  for (const offset of [undefined, 5]) {
    const writes: string[] = [];
    const writer = createTerminalOutputWriter((data) => writes.push(data));
    writer.output({ data: "hello", offset });
    writer.attach("", 0);
    writer.output({ data: "!", offset: offset === undefined ? undefined : 6 });
    expect(writes.join("")).toBe("hello!");
  }
});
