import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("Tin Whistle Note Creator ana sayfasını sunucu tarafında oluşturur", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Tin Whistle Note Creator<\/title>/i);
  assert.match(html, /Turn a melody into/);
  assert.match(html, /Duman —/);
  assert.match(html, /Bu Akşam/);
  assert.match(html, /Notalar\.net/);
  assert.match(html, /Cross-checked/);
  assert.match(html, /Paste notes/);
  assert.match(html, /Import score/);
  assert.match(html, /Correct notes/);
  assert.match(html, /Practice mode/);
  assert.match(html, /Tin whistle sound/);
  assert.match(html, /CC BY-SA 4\.0/);
  assert.match(html, /id="practice-bpm"[^>]+type="range"[^>]+min="40"[^>]+max="220"/);
  assert.match(html, /id="practice-bpm-number"[^>]+type="number"[^>]+min="40"[^>]+max="220"[^>]+value="149"/);
  assert.match(html, />BPM</);
  assert.match(html, /Source quality/);
  assert.match(html, /Songs and melodies, adapted for D tin whistle/);
  assert.doesNotMatch(html, /MVP · D Tin Whistle|Turkish melodies, adapted for tin whistle/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Türkçe/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("tin whistle örnekleri beklenen lisans ve dosya özetiyle paketlenir", async () => {
  const lowSample = await readFile(new URL("../public/audio/tin-whistle/81_v0-127_rr1.wav", import.meta.url));
  const highSample = await readFile(new URL("../public/audio/tin-whistle/85_v0-127_rr1.wav", import.meta.url));
  const attribution = await readFile(new URL("../public/audio/tin-whistle/ATTRIBUTION.md", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(lowSample).digest("hex"), "80fc297682730f42a7370ce5ee599ec8304e9043f6d63d9b94c2c9b994a02b87");
  assert.equal(createHash("sha256").update(highSample).digest("hex"), "33b41f1eb7bed926a1b61c71c62a3e75d43e66175e16b7ea7a437f055d2fbc71");
  assert.match(attribution, /Creative Commons Attribution-ShareAlike 4\.0/);
});

test("çoklu örnekli Irish tin-whistle ses bankası paketlenir", async () => {
  const soundfont = await readFile(new URL("../public/audio/tin-whistle/0780_GeneralUserGS_sf2_file.js", import.meta.url));
  const attribution = await readFile(new URL("../public/audio/tin-whistle/ATTRIBUTION.md", import.meta.url), "utf8");
  const context = { console: { log() {} } };
  runInNewContext(soundfont.toString("utf8"), context);
  const preset = context._tone_0780_GeneralUserGS_sf2_file;
  const canonicalSoundfont = Buffer.from(soundfont.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  assert.equal(createHash("sha256").update(canonicalSoundfont).digest("hex"), "e60df94eba01026614e68f93cc808e98a612ce94bc9d5efa06fa30b2b3b6c396");
  assert.equal(preset.zones.length, 5);
  assert.deepEqual(Array.from(preset.zones, (zone) => zone.originalPitch), [6400, 6900, 7100, 7400, 8100]);
  assert.match(attribution, /GeneralUser GS/);
  assert.match(attribution, /WebAudioFont/);
});

test("temel D tin whistle parmak eşlemelerini içerir", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const fingerings = await readFile(new URL("../app/fingerings.mjs", import.meta.url), "utf8");
  assert.match(fingerings, /D: "111111"/);
  assert.match(fingerings, /F: "1111h0"/);
  assert.match(fingerings, /"F#": "111100"/);
  assert.match(fingerings, /C: "011000"/);
  assert.match(fingerings, /"C#": "000000"/);
  assert.match(page, /arrangePhrasesForDWhistle/);
  assert.match(page, /estimateDWhistleRegisters/);
  assert.match(page, /function parsePhrases/);
  assert.match(page, /parseAbcScore/);
  assert.match(page, /buildPlaybackPlan/);
  assert.match(page, /practice-panel/);
  assert.match(page, /searchMatchScore/);
  assert.match(page, /thesession\.org\/tunes\/search/);
  assert.match(page, /\/api\/search\?q=/);
  assert.match(page, /\/api\/jobs/);
  assert.match(page, /sourceCandidates/);
  assert.match(page, /id="score-input"[^>]+type="file"[^>]+\.musicxml/);
  assert.match(page, /window\.print\(\)/);
});

test("ekran ve PDF çıktısı eşit boyutlu CSS parmak işaretleriyle basılır", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /state === "1" \? "closed"/);
  assert.match(page, /state === "h" \? "half"/);
  assert.match(css, /\.hole \{[^}]*width:10px; height:10px;/);
  assert.match(css, /\.hole\.half \{ background:linear-gradient/);
  assert.match(css, /@page \{ size:A4 portrait; margin:10mm; \}/);
  assert.match(css, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /break-inside:avoid-page/);
});
