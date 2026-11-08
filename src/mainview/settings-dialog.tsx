import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terminal settings</DialogTitle>
          <DialogDescription>Changes save automatically.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5">
          <div className="divide-y divide-border">
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
              <span className="text-xs font-medium">Cursor blink</span>
              <span
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

          <div
            className="mt-1 overflow-x-auto rounded-md bg-background p-3 font-mono [&_*]:font-mono"
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
          <details className="mt-4 border-t border-border pt-4 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Keyboard shortcuts
            </summary>
            <dl className="mt-3 space-y-2">
              {[
                ["New terminal", "Ctrl+T"],
                ["New group", "Ctrl+N"],
                ["Split right", "Ctrl+D"],
                ["Split down", "Ctrl+Shift+D"],
                ["Next terminal", "Ctrl+Tab"],
                ["Previous terminal", "Ctrl+Shift+Tab"],
                ["Select group", "Ctrl+1–9"],
                ["Find in terminal", "Ctrl+F"],
                ["Close find", "Esc"],
              ].map(([action, shortcut]) => (
                <div key={action} className="flex items-center justify-between gap-3">
                  <dt>{action}</dt>
                  <dd className="text-muted-foreground">
                    <kbd className="font-sans">{shortcut}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
