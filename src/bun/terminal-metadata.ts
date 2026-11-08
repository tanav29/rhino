import type { AgentInfo, AgentStatus } from "../shared/rpc-schema";

export type MetadataEvent =
  | { kind: "title"; title: string }
  | { kind: "commandFinished"; durationMs: number; exitCode: number | null };

const statuses = new Set<AgentStatus>(["working", "blocked", "idle", "needs-attention"]);
export const LONG_COMMAND_MS = 10_000;

/** Streaming OSC reader; chunks may split anywhere, including between ESC and ST. */
export class TerminalMetadata {
  private buffer = "";
  private mode: "text" | "escape" | "osc" | "osc-escape" = "text";
  private runningSince: number | null = null;
  private reportedAgent: { name: string; status: AgentStatus; source: AgentInfo["source"] } | null =
    null;
  private lastActivity = Date.now();
  workingDirectory: string | null = null;

  input(now = Date.now()) {
    this.lastActivity = now;
    if (this.reportedAgent) {
      this.reportedAgent.status = "working";
      this.reportedAgent.source = "activity";
    }
  }

  agent(sessionId: string, name: string, now = Date.now()): AgentInfo {
    const reported = this.reportedAgent?.name === name ? this.reportedAgent : null;
    return {
      sessionId,
      name,
      status:
        reported?.source === "reported"
          ? reported.status
          : now - this.lastActivity < LONG_COMMAND_MS
            ? "working"
            : "idle",
      source: reported?.source ?? "activity",
    };
  }

  get agentName() {
    return this.reportedAgent?.name;
  }

  write(chunk: string, now = Date.now()): MetadataEvent[] {
    this.lastActivity = now;
    const events: MetadataEvent[] = [];
    for (const char of chunk) {
      if (this.mode === "text") {
        if (char === "\x1b") this.mode = "escape";
      } else if (this.mode === "escape") {
        this.mode = char === "]" ? "osc" : char === "\x1b" ? "escape" : "text";
        this.buffer = "";
      } else if (char === "\x07" || (this.mode === "osc-escape" && char === "\\")) {
        events.push(...this.osc(this.buffer, now));
        this.buffer = "";
        this.mode = "text";
      } else if (char === "\x1b") {
        this.mode = "osc-escape";
      } else {
        // An embedded ESC cancels the previous sequence, rather than allowing it
        // to hide a later title or completion marker.
        if (this.mode === "osc-escape") {
          this.buffer = "";
          this.mode = char === "]" ? "osc" : "text";
        } else this.buffer += char;
        if (this.buffer.length > 8192) {
          this.buffer = "";
          this.mode = "text";
        }
      }
    }
    return events;
  }

  private osc(value: string, now: number): MetadataEvent[] {
    const [code, marker, ...args] = value.split(";");
    if (["0", "1", "2"].includes(code))
      return [{ kind: "title", title: value.slice(code.length + 1) }];
    if (code === "7") this.workingDirectory = value.slice(2);
    if (code === "133") {
      if (marker === "C") this.runningSince ??= now;
      if (marker === "D") {
        const start = this.runningSince;
        this.runningSince = null;
        this.reportedAgent = null;
        if (start !== null)
          return [
            {
              kind: "commandFinished",
              durationMs: Math.max(0, now - start),
              exitCode: /^-?\d+$/.test(args[0] ?? "") ? Number(args[0]) : null,
            },
          ];
      }
    }
    // Agent hooks can report exact state without scraping a changing TUI.
    if (code === "777" && marker === "rhino" && args[0] === "agent") {
      const [, name, status] = args;
      if (/^[a-z][a-z0-9-]{0,31}$/.test(name ?? "") && statuses.has(status as AgentStatus))
        this.reportedAgent = { name, status: status as AgentStatus, source: "reported" };
    }
    return [];
  }
}
