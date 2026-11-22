// Builds the app icon SVGs from the single mascot drawing (mobile/brand/mascot.svg).
// Usage: node scripts/build-brand.mjs [--png] [previewDir]
// --png also renders the PNG sources for `npm run brand:assets` and public/favicon.svg.
// Writes mobile/brand/icon.svg (full-bleed, iOS and legacy Android),
// icon-foreground.svg and icon-background.svg (Android adaptive icon layers).
// With previewDir it also writes preview.html showing the icon at home-screen sizes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MASCOT_MOODS, mascotMood } from "./mascot-moods.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = resolve(root, "mobile/brand");
const previewArg = process.argv.slice(2).find(arg => !arg.startsWith("--"));
const previewDir = previewArg ? resolve(previewArg) : null;

// Background tuned so the grey fur keeps at least 3:1 contrast with the glow behind it (WCAG 1.4.11).
export const BRAND = Object.freeze({ green: "#264b3e", glow: "#2c5345", night: "#18302a", cream: "#f3ead8", ink: "#2b2320" });

const mascot = await readFile(resolve(brand, "mascot.svg"), "utf8");
const inner = mascot
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<title[\s\S]*?<\/title>/, "")
  .trim();
const withoutNotes = inner.replace(/<g id="notes"[\s\S]*?<\/g>/, "").trim();

// A single note keeps the music idea without adding detail that blurs at small sizes.
const iconNote = `<path d="M300 34 L300 74 Q293 68 285 72 Q275 78 280 86 Q287 94 299 88 Q308 83 308 74 L308 50 Q321 54 323 66 Q329 46 308 34 Z" fill="${BRAND.cream}" stroke="${BRAND.ink}" stroke-width="4" stroke-linejoin="round"/>`;
// Closer crop than the mascot: head, teeth, whistle and the upper hoof.
const iconArt = `<g transform="translate(-16 -2) scale(1.08)">${withoutNotes}</g>${iconNote}`;
const background = `<rect width="360" height="360" fill="${BRAND.green}"/><circle cx="180" cy="200" r="150" fill="${BRAND.glow}"/>`;

const svg = (body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="${label}">${body}</svg>\n`;

const files = {
  "icon.svg": svg(`${background}${iconArt}`, "Tin Whistle Note Creator"),
  // Full size: @capacitor/assets insets the adaptive foreground by 16.7% into Android's 72 of 108 dp safe zone.
  "icon-foreground.svg": svg(iconArt, "Tin Whistle Note Creator"),
  "icon-background.svg": svg(background, ""),
};
// Android 13+ themed icons tint a single-colour layer. The monochrome icon is the filled silhouette of
// the foreground with the eye whites and teeth cut out; these are the white shapes in the drawing.
const cutouts = files["icon-foreground.svg"]
  .replace(/fill="#(?:ffffff|fffaf0|f3ebdc)"/gi, 'fill="KEEP"')
  .replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="none"')
  .replace(/stroke="#[0-9a-fA-F]{6}"/g, 'stroke="none"')
  .replaceAll('fill="KEEP"', 'fill="#000000"');
for (const [name, content] of Object.entries(files)) await writeFile(resolve(brand, name), content);
console.log(`Wrote ${Object.keys(files).join(", ")} to mobile/brand`);

// In-app expressions, served from public/ so the web and the mobile bundle share them.
const moodDir = resolve(root, "public/mascot");
await mkdir(moodDir, { recursive: true });
for (const mood of MASCOT_MOODS) await writeFile(resolve(moodDir, `${mood}.svg`), mascotMood(mascot, mood));
console.log(`Wrote ${MASCOT_MOODS.length} expressions to public/mascot`);

// Source PNGs for `npx capacitor-assets generate` (custom mode) and the web favicon.
if (process.argv.includes("--png")) {
  const { default: sharp } = await import("sharp");
  const out = resolve(brand, "assets");
  await mkdir(out, { recursive: true });
  const render = (svgText, size) => sharp(Buffer.from(svgText), { density: Math.ceil((72 * size) / 360) }).resize(size, size).png();
  // The splash centres the rounded icon, matching what Android 12+ shows on launch.
  const iconBody = files["icon.svg"].replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const splash = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 2732 2732"><defs><clipPath id="r"><rect x="0" y="0" width="360" height="360" rx="81"/></clipPath></defs><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1016 1016) scale(1.9444)"><g clip-path="url(#r)">${iconBody}</g></g></svg>`;
  await render(files["icon.svg"], 1024).toFile(resolve(out, "icon-only.png"));
  await render(files["icon-foreground.svg"], 1024).toFile(resolve(out, "icon-foreground.png"));
  await render(files["icon-background.svg"], 1024).toFile(resolve(out, "icon-background.png"));
  await sharp(Buffer.from(splash(BRAND.cream)), { density: 72 }).png().toFile(resolve(out, "splash.png"));
  // A shade darker than the icon so the rounded icon stays visible on the dark splash.
  await sharp(Buffer.from(splash(BRAND.night)), { density: 72 }).png().toFile(resolve(out, "splash-dark.png"));
  const size = 432;
  const alpha = await render(files["icon-foreground.svg"], size).extractChannel(3).toBuffer();
  const holes = await render(cutouts, size).toBuffer();
  const silhouette = await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha, { raw: undefined }).png().toBuffer();
  await sharp(silhouette)
    .composite([{ input: holes, blend: "dest-out" }])
    .png().toFile(resolve(out, "icon-monochrome.png"));
  await writeFile(resolve(root, "public/favicon.svg"), files["icon.svg"]);
  console.log("Wrote PNG sources to mobile/brand/assets and public/favicon.svg");
}

if (previewDir) {
  await mkdir(previewDir, { recursive: true });
  const dataUri = name => `data:image/svg+xml;base64,${Buffer.from(files[name] ?? mascot).toString("base64")}`;
  const icon = dataUri("icon.svg");
  const sizes = [180, 96, 64, 48, 32];
  const row = (shape, label) => `<section><h2>${label}</h2><div class="row">${sizes.map(size =>
    `<figure><img src="${icon}" width="${size}" height="${size}" class="${shape}" alt=""><figcaption>${size} px</figcaption></figure>`).join("")}</div></section>`;
  const adaptive = `<section><h2>Android uyarlanabilir simge (ön plan + arka plan, daire maskesi)</h2><div class="row">${[180, 96, 48].map(size =>
    `<figure><span class="adaptive" style="width:${size}px;height:${size}px"><img src="${dataUri("icon-background.svg")}" alt=""><img src="${dataUri("icon-foreground.svg")}" alt=""></span><figcaption>${size} px</figcaption></figure>`).join("")}</div></section>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Simge önizleme</title><style>
body{margin:0;padding:24px;font:14px system-ui,sans-serif;background:#f3f5f0;color:#24352f}
.dark{background:#111;color:#eee;padding:16px 24px;margin:24px -24px}
h1{font-size:20px}h2{font-size:14px;margin:18px 0 8px}
.row{display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap}
figure{margin:0;text-align:center}figcaption{font-size:12px;opacity:.7;margin-top:4px}
img.ios{border-radius:22.5%}img.circle{border-radius:50%}img.square{border-radius:12%}
.adaptive{position:relative;display:inline-block;border-radius:50%;overflow:hidden}
.adaptive img{position:absolute;inset:0;width:100%;height:100%}.adaptive img+img{inset:8.3%;width:83.4%;height:83.4%}
.mascot{width:320px;height:320px}
</style></head><body>
<h1>Maskot ve simge önizleme</h1>
<img class="mascot" src="${dataUri("mascot")}" alt="Maskot">
${row("ios", "iOS (yuvarlatılmış kare)")}${row("circle", "Android (daire)")}${adaptive}
<div class="dark">${row("ios", "Koyu ana ekran, iOS")}${row("circle", "Koyu ana ekran, Android")}</div>
</body></html>`;
  await writeFile(resolve(previewDir, "brand-preview.html"), html);
  console.log(`Preview: ${resolve(previewDir, "brand-preview.html")}`);
}
