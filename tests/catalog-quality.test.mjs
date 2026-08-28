import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessSongQuality, auditCatalogQuality } from "../app/catalog-quality.mjs";

test("kaynak kalitesini melodi, ritim ve tempo için ayrı değerlendirir", () => {
  assert.deepEqual(assessSongQuality({
    sourceStatus: "cross-checked",
    rhythm: { source: "text", tempoSource: "database" },
  }), { melody: "cross-checked", rhythm: "text", tempo: "known", tone: "verified" });

  assert.deepEqual(assessSongQuality({
    sourceStatus: "live",
    sourceConfidence: "omr-unreviewed",
    rhythm: { source: "score", tempoSource: "default" },
  }), { melody: "omr-unreviewed", rhythm: "score", tempo: "default", tone: "warning" });
});

test("ritim dizilerinin nota cümleleriyle aynı boyutta olmasını zorunlu tutar", () => {
  const audit = auditCatalogQuality({ songs: [{
    id: "example",
    title: "Example",
    notes: "D4 E4 | F#4",
    rhythm: { bpm: 90, source: "score", tempoSource: "default", durations: [[1], [1]], gaps: [[0, 0], [0]] },
    sourceStatus: "live",
    sourceConfidence: "omr-unreviewed",
    sources: [{ name: "Example", url: "https://example.com", role: "note-source" }],
  }] });
  assert.match(audit.errors[0].message, /durations\[0\].*expected 2/);
});

test("yayındaki katalog yapısal olarak geçerlidir ve temel kalite boşluklarını raporlar", async () => {
  const catalog = JSON.parse(await readFile(new URL("../catalog/catalog.json", import.meta.url), "utf8"));
  const audit = auditCatalogQuality(catalog);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.summary.songs, catalog.songs.length);
  assert.ok(audit.summary.withRhythm > 0);
  assert.ok(audit.summary.equalBeatFallback > 0);
});
