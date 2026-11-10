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
        [35, 0x3e342f],
        [36, 0xe5e0dc],
      ]) {
        const color = new Uint32Array([value]);
        dwm.symbols.DwmSetWindowAttribute(window.ptr, attribute, ptr(color), 4);
      }
    } finally {
      dwm.close();
    }
  } catch (error) {
    console.error("Unable to set window appearance", error);
  }
}
