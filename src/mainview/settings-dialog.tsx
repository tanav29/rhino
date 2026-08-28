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
  step,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const lower = label.toLowerCase();
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-[600] tracking-tight text-white">{label}</span>
        <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-black">
          {display}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
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
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-1 flex-1 accent-white cursor-pointer"
        />

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Increase ${lower}`}
          onClick={() => onChange(value + step)}
          disabled={value >= max}
          className="shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 self-end rounded bg-white/10 px-2 py-1 font-mono text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/20"
      >
        <RotateCcw size={11} />
        Reset
      </button>
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Terminal settings</DialogTitle>
          <DialogDescription>Adjust appearance · stored in workspace.json</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 pb-5 pt-3">
          <Stepper
            label="Font size"
            value={fontSize}
            display={`${fontSize}px`}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
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
            step={0.02}
            onChange={(v) => onLineHeightChange(clampLine(v))}
            onReset={() => onLineHeightChange(LINE_HEIGHT_DEFAULT)}
          />

          <button
            type="button"
            role="switch"
            aria-checked={cursorBlink}
            onClick={() => onCursorBlinkChange(!cursorBlink)}
            className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex flex-col">
              <span className="text-[12.5px] font-[600] tracking-tight text-white">
                Cursor blink
              </span>
              <span className="font-mono text-[11px] text-zinc-500">Blink the block cursor</span>
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                cursorBlink ? "bg-white" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-black transition-transform ${
                  cursorBlink ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <div
            className="rounded-[10px] border border-white/10 bg-[#0e0e0e] p-3 font-mono shadow-inner"
            style={{ fontSize: `${fontSize}px`, lineHeight }}
            aria-hidden
          >
            <span className="text-zinc-300">$</span>{" "}
            <span className="text-white">echo &quot;Hello, term&quot;</span>
            <br />
            <span className="text-emerald-400">Hello, term</span>
            <span
              className={`ml-1 inline-block h-[1.1em] w-[0.55em] translate-y-[2px] bg-white/90 ${
                cursorBlink ? "animate-cursor-blink" : ""
              }`}
            />
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
            Stored via Bun in{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-zinc-200">
              workspace.json
            </code>{" "}
            under userData.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
