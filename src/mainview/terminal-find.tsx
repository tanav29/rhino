import { useEffect, useState, type RefObject } from "react";
import type { WTerm } from "@wterm/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TerminalFind({
  terminal,
  inputRef,
  onClose,
}: {
  terminal: WTerm;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [search, setSearch] = useState(() => terminal.getSearchState());

  useEffect(() => {
    terminal.onSearchChange = setSearch;
    return () => {
      terminal.onSearchChange = null;
      terminal.clearSearch();
    };
  }, [terminal]);

  useEffect(() => {
    terminal.search(query, { caseSensitive });
  }, [caseSensitive, query, terminal]);

  const status = !query
    ? ""
    : search.searching && !search.count
      ? "Searching…"
      : search.count
        ? `${search.activeIndex + 1} of ${search.count.toLocaleString()}${search.limited || search.searching ? "+" : ""}`
        : "No matches";

  return (
    <div
      role="search"
      aria-label="Find in terminal"
      className="absolute top-2 right-2 z-10 flex w-[23rem] max-w-[calc(100%-1rem)] items-center gap-1 rounded-md border border-border bg-popover p-1.5 text-foreground shadow-lg"
    >
      <input
        ref={inputRef}
        aria-label="Find in terminal"
        placeholder="Find in terminal"
        value={query}
        maxLength={1024}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) terminal.findPrevious();
          else terminal.findNext();
        }}
        className="min-w-0 flex-1 rounded-sm bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`shrink-0 px-1 text-[11px] tabular-nums ${query && !search.searching && !search.count ? "text-destructive" : "text-muted-foreground"}`}
      >
        {status}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        title="Match case"
        className={caseSensitive ? "bg-accent text-foreground" : undefined}
        onClick={() => setCaseSensitive((value) => !value)}
      >
        <CaseSensitive />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        disabled={!search.count}
        onClick={() => terminal.findPrevious()}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next match"
        title="Next match (Enter)"
        disabled={!search.count}
        onClick={() => terminal.findNext()}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Close terminal find"
        title="Close (Escape)"
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}
