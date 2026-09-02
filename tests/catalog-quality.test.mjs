import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessSongQuality, auditCatalogQuality, rankCatalogMatches, rankCatalogSongs } from "../app/catalog-quality.mjs";

test("kaynak kalitesini melodi, ritim ve tempo için ayrı değerlendirir", () => {
  assert.deepEqual(assessSongQuality({
    sourceStatus: "cross-checked",
    rhythm: { source: "text", tempoSource: "database" },
  }), { melody: "cross-checked", rhythm: "text", tempo: "known", readiness: "ready", tone: "verified" });

  assert.deepEqual(assessSongQuality({
    sourceStatus: "live",
    sourceConfidence: "omr-unreviewed",
    rhythm: { source: "score", tempoSource: "default" },
  }), { melody: "omr-unreviewed", rhythm: "score", tempo: "default", readiness: "review-required", tone: "warning" });
});

test("öğrenmeye hazır durumu için hem karşılaştırılmış ezgi hem kaynak ritmi ister", () => {
  assert.equal(assessSongQuality({
    sourceStatus: "cross-checked",
    rhythm: { source: "estimated", tempoSource: "database" },
  }).readiness, "melody-draft");

  assert.equal(assessSongQuality({
    sourceStatus: "live",
    sourceConfidence: "score-imported",
    rhythm: { source: "score", tempoSource: "score" },
  }).readiness, "rhythmic-draft");
});

test("eşit arama ilgisinde öğrenmeye daha hazır katalog kaydını öne alır", () => {
  const omr = { title: "Example", sourceStatus: "live", sourceConfidence: "omr-unreviewed", rhythm: { source: "score" } };
  const ready = { title: "Example", sourceStatus: "cross-checked", rhythm: { source: "text", tempoSource: "database" } };
  assert.equal(rankCatalogMatches([{ item: omr, score: 100 }, { item: ready, score: 100 }])[0].item, ready);
  assert.equal(rankCatalogSongs([omr, ready])[0], ready);
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
  assert.ok(audit.summary.reviewRequired > 0);
  assert.equal(
    audit.summary.practiceReady + audit.summary.rhythmicDraft + audit.summary.melodyDraft + audit.summary.reviewRequired,
    catalog.songs.length,
  );
});
