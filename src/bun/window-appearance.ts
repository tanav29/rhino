import { dlopen, FFIType, ptr } from "bun:ffi";
import { dirname, join } from "node:path";
import type { BrowserWindow } from "electrobun/main";

export function setWindowAppearance(window: BrowserWindow) {
  if (process.platform !== "win32" || !window.ptr) return;
  // Electrobun embeds the EXE icon; Windows also needs icons on the HWND.
  try {
    const bin = dirname(process.execPath);
    const user32 = dlopen("user32.dll", {
      IsWindow: { args: [FFIType.ptr], returns: FFIType.bool },
      LoadImageW: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
        returns: FFIType.ptr,
      },
      PostMessageW: {
        args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
        returns: FFIType.bool,
      },
    });
    try {
      if (!user32.symbols.IsWindow(window.ptr)) throw new Error("Invalid native window handle");
      const path = Buffer.from(`${join(bin, "../Resources/app.ico")}\0`, "utf16le");
      for (const [kind, size] of [
        [0, 16],
        [1, 32],
      ]) {
        // HICONs stay alive for the window lifetime and are released on process exit.
        const icon = user32.symbols.LoadImageW(null, ptr(path), 1, size, size, 0x10);
        if (!icon) throw new Error("Unable to load app.ico");
        // Queue to the UI thread; synchronously sending from Bun's worker can deadlock.
        if (!user32.symbols.PostMessageW(window.ptr, 0x80, kind, icon)) {
          throw new Error("Unable to apply window icon");
        }
      }
    } finally {
      user32.close();
    }
  } catch (error) {
    console.error("Unable to set window appearance", error);
  }
  setWindowTheme(window, "#282c33");
}

export function setWindowTheme(window: BrowserWindow, background: string) {
  if (process.platform !== "win32" || !window.ptr) return;
  const match = /^#([\da-f]{6})(?:[\da-f]{2})?$/i.exec(background);
  if (!match) return;

  const red = parseInt(match[1].slice(0, 2), 16);
  const green = parseInt(match[1].slice(2, 4), 16);
  const blue = parseInt(match[1].slice(4, 6), 16);
  const captionColor = red | (green << 8) | (blue << 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const textColor = luminance > 0.6 ? 0x000000 : 0xffffff;

  try {
    const dwm = dlopen("dwmapi.dll", {
      DwmSetWindowAttribute: {
        args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32],
        returns: FFIType.i32,
      },
    });
    try {
      // Unsupported caption colors on older Windows versions are safely ignored.
      for (const [attribute, value] of [
        [20, 1],
        [35, captionColor],
        [36, textColor],
      ]) {
        const color = new Uint32Array([value]);
        dwm.symbols.DwmSetWindowAttribute(window.ptr, attribute, ptr(color), 4);
      }
    } finally {
      dwm.close();
    }
  } catch (error) {
    console.error("Unable to set window theme", error);
  }
}
