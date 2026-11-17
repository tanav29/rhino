/** Keep live output behind its replay snapshot and omit text already covered by it. */
export function createTerminalOutputWriter(write: (data: string) => void) {
  type Output = { data: string; offset?: number };
  let pending: Output[] | null = [];
  let writtenOffset = 0;
  const append = ({ data, offset }: Output) => {
    if (offset === undefined) {
      write(data);
      return;
    }
    const start = Math.max(0, writtenOffset - (offset - data.length));
    if (start < data.length) write(data.slice(start));
    writtenOffset = Math.max(writtenOffset, offset);
  };
  return {
    output(chunk: Output) {
      if (pending) pending.push(chunk);
      else append(chunk);
    },
    attach(replay: string, offset = 0) {
      if (replay) write(replay);
      writtenOffset = offset;
      const queued = pending;
      pending = null;
      queued?.forEach(append);
    },
  };
}
