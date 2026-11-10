import { mkdtemp, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Windows' built-in image codec keeps icon generation dependency-free.
if (process.platform !== "win32") throw new Error("Icon generation requires Windows.");
const root = resolve(import.meta.dir, "..");
const output = await mkdtemp(join(tmpdir(), "term-icons-"));
const sizes = [16, 24, 32, 48, 64, 128, 256];
try {
  const resize = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.Drawing
      $source = [System.Drawing.Image]::FromFile($env:TERM_ICON_SOURCE)
      try {
        foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
          $image = [System.Drawing.Bitmap]::new($size, $size)
          $graphics = [System.Drawing.Graphics]::FromImage($image)
          try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($source, 0, 0, $size, $size)
            $image.Save((Join-Path $env:TERM_ICON_OUTPUT "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
          } finally { $graphics.Dispose(); $image.Dispose() }
        }
      } finally { $source.Dispose() }
    `,
    ],
    {
      env: { ...process.env, TERM_ICON_SOURCE: join(root, "logo.png"), TERM_ICON_OUTPUT: output },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (await resize.exited) throw new Error("Failed to resize icon source.");
  const images = await Promise.all(
    sizes.map(async (size) =>
      Buffer.from(await Bun.file(join(output, `${size}.png`)).arrayBuffer()),
    ),
  );
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await Bun.write(join(root, "assets/icon.ico"), Buffer.concat([header, ...images]));
  await Bun.write(join(root, "assets/logo.png"), images.at(-1)!);
  await Bun.write(join(root, "marketing/assets/logo.png"), images.at(-1)!);
  console.log("Generated Windows icon (16–256px), webview logo, and marketing logo from logo.png.");
} finally {
  await Promise.all(sizes.map((size) => rm(join(output, `${size}.png`), { force: true })));
  await rmdir(output);
}
