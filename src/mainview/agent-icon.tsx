import { Bot } from "lucide-react";
import aider from "./icons/agents/aider.svg?inline";
import claude from "./icons/agents/claude.svg?inline";
import codex from "./icons/agents/codex.svg?inline";
import copilot from "./icons/agents/copilot.svg?inline";
import cursor from "./icons/agents/cursor.svg?inline";
import gemini from "./icons/agents/gemini.svg?inline";
import opencode from "./icons/agents/opencode.svg?inline";

// Logos: Lobe Icons (MIT) and Aider (Apache-2.0); licenses are beside the SVGs.
// Inline masks avoid external resource restrictions on the packaged views:// scheme.
const icons: Record<string, string> = { aider, claude, codex, copilot, cursor, gemini, opencode };

export function AgentIcon({ name }: { name: string }) {
  const icon = icons[name.toLowerCase()];
  if (!icon) return <Bot size={16} className="shrink-0" aria-hidden="true" />;

  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 bg-current [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]"
      style={{ maskImage: `url("${icon}")` }}
    />
  );
}
