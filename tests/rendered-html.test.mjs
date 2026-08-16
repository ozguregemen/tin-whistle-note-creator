import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /Türkçe/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("temel D tin whistle parmak eşlemelerini içerir", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const fingerings = await readFile(new URL("../app/fingerings.mjs", import.meta.url), "utf8");
  assert.match(fingerings, /D: "111111"/);
  assert.match(fingerings, /F: "1111h0"/);
  assert.match(fingerings, /"F#": "111100"/);
  assert.match(fingerings, /C: "011000"/);
  assert.match(fingerings, /"C#": "000000"/);
  assert.match(page, /adaptPhrasesToDWhistle/);
  assert.match(page, /function parsePhrases/);
  assert.match(page, /function parseAbcNotes/);
  assert.match(page, /searchMatchScore/);
  assert.match(page, /thesession\.org\/tunes\/search/);
  assert.match(page, /\/api\/search\?q=/);
  assert.match(page, /\/api\/jobs/);
  assert.match(page, /sourceCandidates/);
  assert.match(page, /window\.print\(\)/);
});

test("PDF çıktısı parmakları metin sembolleriyle ve sıkıştırılmış düzenle basar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /state === "1" \? "●"/);
  assert.match(page, /state === "h" \? "◐"/);
  assert.match(css, /@page \{ size:A4 portrait; margin:10mm; \}/);
  assert.match(css, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /break-inside:avoid-page/);
});
