import { useEffect, useState, type RefObject } from "react";
import type { SearchAddon, ISearchOptions } from "@xterm/addon-search";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TerminalFind({
  searchAddon,
  inputRef,
  onClose,
}: {
  searchAddon: SearchAddon;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [search, setSearch] = useState({ resultIndex: -1, resultCount: 0 });
  const options: ISearchOptions = {
    caseSensitive,
    decorations: {
      matchBackground: "#665522",
      matchOverviewRuler: "#e5c07b",
      activeMatchBackground: "#996b20",
      activeMatchColorOverviewRuler: "#ffd885",
    },
  };

  useEffect(() => {
    const subscription = searchAddon.onDidChangeResults(setSearch);
    return () => {
      subscription.dispose();
      searchAddon.clearDecorations();
    };
  }, [searchAddon]);

  useEffect(() => {
    searchAddon.findNext(query, { ...options, incremental: true });
  }, [caseSensitive, query, searchAddon]);

  const status = !query
    ? ""
    : search.resultCount
      ? search.resultIndex < 0
        ? `${search.resultCount.toLocaleString()}+ matches`
        : `${search.resultIndex + 1} of ${search.resultCount.toLocaleString()}`
      : "No matches";

  return (
    <div
      role="search"
      aria-label="Find in terminal"
      className="absolute top-0 right-0 z-10 flex w-[23rem] max-w-full items-center gap-1 rounded-bl-sm border border-border bg-popover p-1 text-foreground"
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
          if (event.shiftKey) searchAddon.findPrevious(query, options);
          else searchAddon.findNext(query, options);
        }}
        className="h-6 min-w-0 rounded-md border border-input/60 bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 disabled:opacity-50 flex-1"
      />
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`shrink-0 px-1 text-[11px] tabular-nums ${query && !search.resultCount ? "text-destructive" : "text-muted-foreground"}`}
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
        disabled={!search.resultCount}
        onClick={() => searchAddon.findPrevious(query, options)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next match"
        title="Next match (Enter)"
        disabled={!search.resultCount}
        onClick={() => searchAddon.findNext(query, options)}
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
