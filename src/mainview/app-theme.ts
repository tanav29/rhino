import type { TerminalTheme } from "../shared/rpc-schema";

// Map VS Code's workbench colors to the tokens shared by Rhino's controls.
export function appThemeVariables(theme: TerminalTheme): Record<string, string> {
  const colors = theme.colors;
  const get = (...keys: string[]) =>
    keys
      .map((key) => colors[key])
      .find((value) => typeof value === "string" && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value));
  const background = get("editor.background", "terminal.background") ?? "#282c33";
  const foreground = get("editor.foreground", "terminal.foreground") ?? "#dce0e5";
  const surface =
    get("sideBar.background", "editorWidget.background") ??
    `color-mix(in srgb, ${background} 94%, ${foreground})`;
  const accent =
    get("list.hoverBackground", "list.activeSelectionBackground") ??
    `color-mix(in srgb, ${background} 88%, ${foreground})`;
  const primary = get("focusBorder", "button.background", "terminal.ansiBlue") ?? foreground;
  const channel = (offset: number) => parseInt(background.slice(offset, offset + 2), 16) / 255;
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return {
    "color-scheme": luminance > 0.6 ? "light" : "dark",
    "--background": background,
    "--foreground": foreground,
    "--card": surface,
    "--popover": get("editorWidget.background") ?? surface,
    "--popover-foreground": get("editorWidget.foreground") ?? foreground,
    "--sidebar": surface,
    "--sidebar-foreground": get("sideBar.foreground") ?? foreground,
    "--secondary": accent,
    "--muted": surface,
    "--accent": accent,
    "--accent-foreground": get("list.activeSelectionForeground") ?? foreground,
    "--muted-foreground":
      get("descriptionForeground") ?? `color-mix(in srgb, ${foreground} 70%, ${background})`,
    "--border":
      get("panel.border", "sideBar.border", "input.border") ??
      `color-mix(in srgb, ${background} 75%, ${foreground})`,
    "--input": get("input.border") ?? `color-mix(in srgb, ${background} 65%, ${foreground})`,
    "--primary": primary,
    "--primary-foreground": get("button.foreground") ?? background,
    "--ring": primary,
    "--selection":
      get("editor.selectionBackground", "terminal.selectionBackground") ??
      `color-mix(in srgb, ${primary} 30%, transparent)`,
    "--destructive": get("errorForeground", "terminal.ansiRed") ?? "#e06c75",
    "--success": get("terminal.ansiGreen") ?? "#a1c181",
    "--warning": get("terminal.ansiYellow") ?? "#dec184",
  };
}

export function applyAppTheme(theme: TerminalTheme | undefined): () => void {
  if (!theme) return () => {};
  const root = document.documentElement;
  const variables = appThemeVariables(theme);
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
  return () => {
    for (const name of Object.keys(variables)) root.style.removeProperty(name);
  };
}
