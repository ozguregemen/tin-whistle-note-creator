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
  assert.match(html, /Üsküdar’a Gider İken/);
  assert.match(html, /Paste notes/);
  assert.match(html, /Türkçe/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("temel D tin whistle parmak eşlemelerini içerir", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /D: "111111"/);
  assert.match(page, /"F#": "111100"/);
  assert.match(page, /"C#": "000000"/);
  assert.match(page, /function parsePhrases/);
  assert.match(page, /window\.print\(\)/);
});
