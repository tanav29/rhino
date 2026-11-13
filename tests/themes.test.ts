import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { appThemeVariables } from "../src/mainview/app-theme";
import { readThemePackage } from "../src/bun/themes";

describe("Marketplace themes", () => {
  test("loads inherited JSONC colors and editor fallbacks", () => {
    const zip = zipSync({
      "extension/package.json": strToU8(
        JSON.stringify({
          contributes: { themes: [{ label: "Example", path: "themes/child.json" }] },
        }),
      ),
      "extension/themes/child.json": strToU8(
        '{ "include": "./base.json", "colors": { "terminal.ansiRed": "#ff0000", }, }',
      ),
      "extension/themes/base.json": strToU8(
        '{ // comment\n "colors": { "editor.background": "#123456", "panel.border": "#654321", "terminal.foreground": "#abcdef" } }',
      ),
    });
    expect(readThemePackage(zip, "author.example")).toEqual([
      {
        id: "author.example:0",
        name: "Example",
        colors: {
          "editor.background": "#123456",
          "panel.border": "#654321",
          "terminal.background": "#123456",
          "terminal.foreground": "#abcdef",
          "terminal.ansiRed": "#ff0000",
        },
      },
    ]);
  });
  test("maps workbench colors and falls back to terminal colors for older imports", () => {
    const variables = appThemeVariables({
      id: "example",
      name: "Example",
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#111111",
        "sideBar.background": "#eeeeee",
        "sideBar.border": "#abcdef",
        "panel.border": "#345678",
        "input.border": "#123456",
        focusBorder: "#0055aa",
      },
    });
    expect(variables["--background"]).toBe("#ffffff");
    expect(variables["--sidebar"]).toBe("#eeeeee");
    expect(variables["--ring"]).toBe("#0055aa");
    expect(variables["--border"]).toBe("#345678");
    expect(variables["--sidebar-border"]).toBe("#abcdef");
    expect(variables["--input"]).toBe("#123456");
    expect(variables["color-scheme"]).toBe("light");
    expect(
      appThemeVariables({
        id: "old",
        name: "Old",
        colors: { "terminal.background": "#111111", "terminal.foreground": "#eeeeee" },
      })["--background"],
    ).toBe("#111111");
  });
  test("rejects include paths outside the extension", () => {
    const zip = zipSync({
      "extension/package.json": strToU8('{"contributes":{"themes":[{"path":"../bad.json"}]}}'),
    });
    expect(() => readThemePackage(zip, "author.example")).toThrow("Invalid theme include");
  });
});
