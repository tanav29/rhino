import { useState } from "react";
import { getBackendClient } from "./rpc";
import { useWorkspaceStore } from "./store";
import { Tabs } from "@base-ui/react/tabs";
import { Keyboard, Minus, Monitor, Plus, RotateCcw, Terminal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    <div className="flex flex-col gap-1 py-3">
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
  const themes = useWorkspaceStore((s) => s.terminalThemes);
  const selected = useWorkspaceStore((s) => s.selectedThemeId);
  const setThemes = useWorkspaceStore((s) => s.setThemes);
  const [extension, setExtension] = useState("");
  const [themeError, setThemeError] = useState("");
  const [installing, setInstalling] = useState(false);
  const install = async () => {
    setInstalling(true);
    setThemeError("");
    try {
      const imported = await getBackendClient().request.installMarketplaceThemes({ extension });
      if (!imported.length) throw new Error("No themes found in this extension");
      const prefix = imported[0].id.split(":")[0].toLowerCase();
      setThemes(
        [...themes.filter((theme) => theme.id.split(":")[0].toLowerCase() !== prefix), ...imported],
        imported[0].id,
      );
      setExtension("");
    } catch (error) {
      setThemeError(error instanceof Error ? error.message : "Unable to install theme");
    } finally {
      setInstalling(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(520px,90dvh)] flex-col sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs.Root defaultValue="terminal" orientation="vertical" className="flex min-h-0 flex-1">
          <Tabs.List
            aria-label="Settings sections"
            activateOnFocus
            className="flex w-10 shrink-0 flex-col border-r border-border bg-sidebar py-1 sm:w-44"
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
                className="flex min-h-7 items-center justify-center gap-2 border-l-2 border-transparent px-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground aria-selected:border-l-ring aria-selected:bg-accent aria-selected:text-foreground sm:justify-start"
              >
                <Icon size={15} className="shrink-0" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value="terminal" className="min-w-0 flex-1 overflow-y-auto bg-background p-4">
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

              <label className="flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left">
                <span className="space-y-1">
                  <span className="block text-xs font-medium">Cursor blink</span>
                  <span className="block text-xs text-muted-foreground">
                    Off by default for a steady cursor.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={cursorBlink}
                  onChange={(event) => onCursorBlinkChange(event.target.checked)}
                  className="size-3.5 shrink-0 accent-ring"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <label htmlFor="terminal-theme" className="block text-xs font-medium">
                Terminal theme
              </label>
              <select
                id="terminal-theme"
                className="ui-input w-full"
                value={selected}
                onChange={(event) => setThemes(themes, event.target.value)}
              >
                <option value="">Rhino default</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
              {selected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setThemes(
                      themes.filter((theme) => theme.id !== selected),
                      "",
                    )
                  }
                >
                  Remove selected theme
                </Button>
              )}
              <label htmlFor="theme-extension" className="block text-xs font-medium">
                Install from VS Code Marketplace
              </label>
              <div className="flex gap-2">
                <input
                  id="theme-extension"
                  className="ui-input flex-1"
                  placeholder="publisher.extension"
                  value={extension}
                  onChange={(event) => setExtension(event.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={installing || !extension.trim()}
                  onClick={() => void install()}
                >
                  {installing ? "Installing?" : "Install"}
                </Button>
              </div>
              {themeError && (
                <p role="alert" className="text-xs text-destructive">
                  {themeError}
                </p>
              )}
            </div>
            <p className="mt-3 mb-2 text-xs font-medium text-muted-foreground">Preview</p>
            <div
              className="overflow-x-auto rounded-sm border border-border bg-background p-3 font-mono [&_*]:font-mono"
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

          <Tabs.Panel value="machines" className="min-w-0 flex-1 overflow-y-auto bg-background p-4">
            <h2 className="text-sm font-semibold">Machines</h2>
            <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
              Connect to another machine or share access to this one.
            </p>
            <BackendSettings />
          </Tabs.Panel>

          <Tabs.Panel
            value="shortcuts"
            className="min-w-0 flex-1 overflow-y-auto bg-background p-4"
          >
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
                <div
                  key={action}
                  className="flex min-h-7 flex-wrap items-center justify-between gap-2 py-1"
                >
                  <dt>{action}</dt>
                  <dd className="text-muted-foreground">
                    <kbd className="ui-keycap">{shortcut}</kbd>
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
