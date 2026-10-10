import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// Next's pinned image pipeline supplies sharp; no additional runtime dependency.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const sharp = nextRequire("sharp");
const design = JSON.parse(await readFile(join(root, "assets/brand/icon-design.json"), "utf8"));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100"><rect width="100" height="100" fill="${design.background}"/><path d="${design.house}" fill="${design.foreground}"/><path d="${design.sparkle}" fill="${design.background}"/></svg>`;
const web = join(root, "public/icons/ivory-v1");
const native = join(root, "ios/OuchiMaintenance/Assets.xcassets/AppIcon.appiconset");
await mkdir(web, { recursive: true });
await mkdir(native, { recursive: true });
await writeFile(join(web, "icon.svg"), svg + "\n");
for (const size of [180, 192, 512, 1024]) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).removeAlpha().toColourspace("srgb").png().toBuffer();
  await writeFile(join(web, `icon-${size}.png`), png);
  if (size === 1024) await writeFile(join(native, "AppIcon.png"), png);
}
await writeFile(join(native, "Contents.json"), JSON.stringify({
  images: [{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
  info: { author: "xcode", version: 1 },
}, null, 2) + "\n");
await writeFile(join(root, "ios/OuchiMaintenance/Assets.xcassets/Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
console.log("Generated ivory-v1 SVG, opaque sRGB PNGs, and iOS AppIcon asset catalog.");
