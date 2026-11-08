import { Bot } from "lucide-react";
import aider from "./icons/agents/aider.svg";
import claude from "./icons/agents/claude.svg";
import codex from "./icons/agents/codex.svg";
import copilot from "./icons/agents/copilot.svg";
import cursor from "./icons/agents/cursor.svg";
import gemini from "./icons/agents/gemini.svg";
import opencode from "./icons/agents/opencode.svg";

// Logos: Lobe Icons (MIT) and Aider (Apache-2.0); licenses are beside the SVGs.
const icons: Record<string, string> = { aider, claude, codex, copilot, cursor, gemini, opencode };

export function AgentIcon({ name }: { name: string }) {
  const icon = icons[name.toLowerCase()];
  if (!icon) return <Bot size={16} className="shrink-0" aria-hidden="true" />;

  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 bg-current [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]"
      style={{ maskImage: `url(${icon})` }}
    />
  );
}
