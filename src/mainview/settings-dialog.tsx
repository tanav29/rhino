import { Tabs } from "@base-ui/react/tabs";
import { Keyboard, Minus, Monitor, Plus, RotateCcw, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BackendSettings } from "./backend-settings";
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_DEFAULT,
} from "./store";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineHeight: number;
  onLineHeightChange: (lineHeight: number) => void;
  cursorBlink: boolean;
  onCursorBlinkChange: (blink: boolean) => void;
}

const clampFont = (v: number) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(v)));
const clampLine = (v: number) =>
  Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(v * 100) / 100));

function Stepper({
  label,
  value,
  display,
  min,
  max,
  defaultValue,
  step,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const lower = label.toLowerCase();
  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{display}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Reset ${lower}`}
          title={`Reset ${lower}`}
          disabled={value === defaultValue}
          onClick={onReset}
        >
          <RotateCcw size={12} />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Decrease ${lower}`}
          onClick={() => onChange(value - step)}
          disabled={value <= min}
          className="shrink-0"
        >
          <Minus size={14} />
        </Button>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={display}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-4 min-w-0 flex-1 accent-ring cursor-pointer"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Increase ${lower}`}
          onClick={() => onChange(value + step)}
          disabled={value >= max}
          className="shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  fontSize,
  onFontSizeChange,
  lineHeight,
  onLineHeightChange,
  cursorBlink,
  onCursorBlinkChange,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(620px,90dvh)] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border pb-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes save automatically.</DialogDescription>
        </DialogHeader>

        <Tabs.Root defaultValue="terminal" orientation="vertical" className="flex min-h-0 flex-1">
          <Tabs.List
            aria-label="Settings sections"
            activateOnFocus
            className="flex w-12 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-1.5 sm:w-44 sm:p-3"
          >
            {[
              { value: "terminal", label: "Terminal", icon: Terminal },
              { value: "machines", label: "Machines", icon: Monitor },
              { value: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard },
            ].map(({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                title={label}
                className="flex min-h-9 items-center justify-center gap-2 rounded-md px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-selected:bg-accent aria-selected:text-foreground focus-visible:-outline-offset-2 sm:justify-start"
              >
                <Icon size={15} className="shrink-0" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value="terminal" className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <h2 className="text-sm font-semibold">Terminal</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Adjust the text and cursor in your terminals.
            </p>
            <div className="mt-3 divide-y divide-border">
            <Stepper
              label="Font size"
              value={fontSize}
              display={`${fontSize}px`}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              defaultValue={FONT_SIZE_DEFAULT}
              step={1}
              onChange={(v) => onFontSizeChange(clampFont(v))}
              onReset={() => onFontSizeChange(FONT_SIZE_DEFAULT)}
            />

            <Stepper
              label="Line height"
              value={lineHeight}
              display={lineHeight.toFixed(2)}
              min={LINE_HEIGHT_MIN}
              max={LINE_HEIGHT_MAX}
              defaultValue={LINE_HEIGHT_DEFAULT}
              step={0.02}
              onChange={(v) => onLineHeightChange(clampLine(v))}
              onReset={() => onLineHeightChange(LINE_HEIGHT_DEFAULT)}
            />

            <button
              type="button"
              role="switch"
              aria-checked={cursorBlink}
              onClick={() => onCursorBlinkChange(!cursorBlink)}
              className="flex w-full items-center justify-between gap-4 py-4 text-left"
            >
              <span className="space-y-1">
                <span className="block text-xs font-medium">Cursor blink</span>
                <span className="block text-xs text-muted-foreground">Animate the terminal cursor.</span>
              </span>
              <span
                aria-hidden="true"
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  cursorBlink ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full transition-transform ${cursorBlink ? "bg-primary-foreground" : "bg-foreground"} ${
                    cursorBlink ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
            </div>

            <p className="mt-5 mb-2 text-xs font-medium text-muted-foreground">Preview</p>
            <div
            className="overflow-x-auto rounded-md border border-border bg-background p-4 font-mono [&_*]:font-mono"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
            aria-hidden
          >
            <span className="text-foreground">$</span>{" "}
            <span className="text-foreground">echo &quot;Hello, Rhino&quot;</span>
            <br />
            <span className="text-success">Hello, Rhino</span>
            <span
              className={`ml-1 inline-block h-[1.1em] w-[0.55em] translate-y-[2px] bg-ring ${
                cursorBlink ? "animate-cursor-blink" : ""
              }`}
            />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="machines" className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <h2 className="text-sm font-semibold">Machines</h2>
            <p className="mt-1 mb-5 text-xs leading-relaxed text-muted-foreground">
              Connect to another machine or share access to this one.
            </p>
            <BackendSettings />
          </Tabs.Panel>

          <Tabs.Panel value="shortcuts" className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Navigate groups and terminals from your keyboard.
            </p>
            <dl className="mt-4 divide-y divide-border text-xs">
              {[
                ["New terminal", "Ctrl+T"],
                ["New group", "Ctrl+N"],
                ["Split right", "Ctrl+D"],
                ["Split down", "Ctrl+Shift+D"],
                ["Next terminal", "Ctrl+Tab"],
                ["Previous terminal", "Ctrl+Shift+Tab"],
                ["Select group", "Ctrl+1–9"],
                ["Find in terminal", "Ctrl+Alt+F"],
                ["Close find", "Esc"],
              ].map(([action, shortcut]) => (
                <div key={action} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <dt>{action}</dt>
                  <dd className="text-muted-foreground">
                    <kbd className="rounded border border-border bg-background px-1.5 py-1 font-sans text-[11px] whitespace-nowrap">{shortcut}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </Tabs.Panel>
        </Tabs.Root>
      </DialogContent>
    </Dialog>
  );
}
