// Google Play store graphics, in the fastlane supply folder layout:
//   store/google-play/<lang>/images/icon.png           512x512, 32-bit PNG
//   store/google-play/<lang>/images/featureGraphic.png 1024x500, no transparency
//   store/google-play/<lang>/images/phoneScreenshots/  framed screenshots (see below)
//
// Screenshots: put raw phone screenshots in store/google-play/screenshots/raw/<lang>/
// named 01-*.png, 02-*.png … and their captions in store/google-play/screenshots/captions.json
// ({ "tr-TR": { "01": "…" }, "en-US": { "01": "…" } }). Phone screenshots are often taller than
// Play's 2:1 limit, so each is placed on a 1080x1920 branded frame with its caption.
//
// Usage: node scripts/store-graphics.mjs
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = resolve(root, "store/google-play");
const COLORS = { green: "#264b3e", glow: "#2c5345", cream: "#f3ead8", gold: "#e7c45a" };
const TEXT = {
  "tr-TR": { tagline: "Nota · Prova · Eğitim", line: "Şarkıları tin whistle parmak şemasına çevir" },
  "en-US": { tagline: "Notes · Practice · Lessons", line: "Turn songs into tin whistle fingerings" },
};
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

async function svgFile(path, size) {
  return sharp(await readFile(path), { density: Math.ceil((72 * size) / 360) }).resize(size, size).png().toBuffer();
}

async function featureGraphic(lang) {
  const t = TEXT[lang];
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
    <rect width="1024" height="500" fill="${COLORS.green}"/>
    <circle cx="790" cy="270" r="250" fill="${COLORS.glow}"/>
    <text x="64" y="190" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${COLORS.cream}">Tin Whistle</text>
    <text x="64" y="258" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${COLORS.cream}">Note Creator</text>
    <text x="66" y="318" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="${COLORS.gold}">${escape(t.tagline)}</text>
    <text x="66" y="362" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="${COLORS.cream}">${escape(t.line)}</text>
  </svg>`);
  const mascot = await svgFile(resolve(root, "public/mascot/welcome.svg"), 460);
  return sharp(background).composite([{ input: mascot, left: 548, top: 30 }]).removeAlpha().png();
}

async function frame(rawPath, caption) {
  const width = 1080;
  const height = 1920;
  const shotHeight = 1500;
  const shot = sharp(rawPath).resize({ height: shotHeight, fit: "inside" });
  const { width: shotWidth } = await shot.clone().toBuffer({ resolveWithObject: true }).then(result => result.info);
  const radius = 44;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotWidth}" height="${shotHeight}"><rect width="${shotWidth}" height="${shotHeight}" rx="${radius}" fill="#fff"/></svg>`);
  const rounded = await shot.composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const lines = caption.split("\n");
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${COLORS.green}"/>
    <circle cx="540" cy="1300" r="700" fill="${COLORS.glow}"/>
    ${lines.map((line, index) => `<text x="540" y="${150 + index * 76}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="62" font-weight="700" fill="${COLORS.cream}">${escape(line)}</text>`).join("")}
    <rect x="${(width - shotWidth) / 2 - 6}" y="${height - shotHeight - 74}" width="${shotWidth + 12}" height="${shotHeight + 12}" rx="${radius + 6}" fill="#18302a"/>
  </svg>`);
  return sharp(background)
    .composite([{ input: rounded, left: Math.round((width - shotWidth) / 2), top: height - shotHeight - 68 }])
    .removeAlpha().png();
}

for (const lang of Object.keys(TEXT)) {
  const images = resolve(store, lang, "images");
  await mkdir(images, { recursive: true });
  await sharp(await svgFile(resolve(root, "mobile/brand/icon.svg"), 512)).png().toFile(resolve(images, "icon.png"));
  await (await featureGraphic(lang)).toFile(resolve(images, "featureGraphic.png"));

  const rawDir = resolve(store, "screenshots/raw", lang);
  if (!existsSync(rawDir)) continue;
  const captions = JSON.parse(await readFile(resolve(store, "screenshots/captions.json"), "utf8"))[lang] ?? {};
  const out = resolve(images, "phoneScreenshots");
  await mkdir(out, { recursive: true });
  for (const name of (await readdir(rawDir)).filter(file => /^\d{2}.*\.(png|jpe?g)$/i.test(file)).sort()) {
    const key = name.slice(0, 2);
    await (await frame(resolve(rawDir, name), captions[key] ?? "")).toFile(resolve(out, `${key}.png`));
  }
}
console.log("Store graphics written to store/google-play/<lang>/images");
