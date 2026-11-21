import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { browseCatalogGroups, groupCatalogSongs, isApprovedCatalogSong, withBundledCatalogSongs } from "../app/catalog-browse.mjs";
import { assessSongQuality } from "../app/catalog-quality.mjs";
import { fingeringFor } from "../app/fingerings.mjs";

const approved = {
  title: "Bu Akşam",
  artist: "Duman",
  aliases: ["İçerim Ben Bu Akşam"],
  sourceStatus: "cross-checked",
};
const live = {
  title: "Caddelerde Rüzgar",
  artist: "Nilüfer",
  aliases: [],
  sourceStatus: "live",
  rhythm: { source: "score" },
};
const unchecked = {
  title: "Delikanlım",
  aliases: [],
  sourceStatus: "cross-checked",
  sourceConfidence: "omr-unreviewed",
};
const audioDraft = {
  title: "Küçük Yıldız",
  aliases: [],
  sourceStatus: "cross-checked",
  rhythm: { source: "transcribed" },
};

function browse(songs, query, approvedOnly, language) {
  return browseCatalogGroups(groupCatalogSongs(songs), query, approvedOnly, language).map(group => group.song);
}

test("approved view includes cross-checked melodies with estimated rhythm and excludes drafts", () => {
  const songs = [live, audioDraft, unchecked, approved];
  assert.deepEqual(browse(songs, "", true, "tr"), [approved]);
  assert.deepEqual(browse(songs, "", false, "tr"), [approved, live, unchecked, audioDraft]);
});

test("catalog filters by partial title, artist, and alias without requiring Turkish diacritics", () => {
  const songs = [live, approved];
  assert.deepEqual(browse(songs, "aks dum", true, "tr"), [approved]);
  assert.deepEqual(browse(songs, "icerim", true, "en"), [approved]);
  assert.deepEqual(browse(songs, "nilu ruzg", false, "tr"), [live]);
  assert.deepEqual(browse(songs, "nilu", true, "tr"), []);
});

test("a contributor can be searched and their version stays out of Approved", () => {
  const contribution = { ...approved, id: "contribution", contributor: "example-player", sourceStatus: "live" };
  const [group] = browseCatalogGroups(groupCatalogSongs([approved, contribution]), "@example-player", false, "en");
  assert.equal(group.song, approved);
  assert.deepEqual(group.alternatives, [contribution]);
  assert.deepEqual(browse([approved, contribution], "@example-player", true, "en"), []);
});

test("alternate scores share a catalog row, searchable aliases and a primary verified score", () => {
  const score = { id: "main", title: "Arkadaşım Eşek", artist: "Barış Manço", aliases: [], sourceStatus: "cross-checked" };
  const duplicate = { id: "duplicate", title: "arkadasim esek", artist: "Baris Manco", aliases: [], sourceStatus: "live" };
  const flute = { id: "flute", title: "Arkadaşım Eşek Flüt", catalogTitle: score.title, artist: score.artist, aliases: ["blok flüt"], sourceStatus: "live" };
  const other = { id: "other", title: score.title, artist: "Another Artist", aliases: [], sourceStatus: "live" };
  const groups = groupCatalogSongs([duplicate, flute, other, score]);
  assert.equal(groups.length, 2);
  const [group] = browseCatalogGroups(groups, "blok flut", false, "tr");
  assert.equal(group.title, score.title);
  assert.equal(group.song, score);
  assert.deepEqual(group.alternatives, [duplicate, flute]);
  assert.deepEqual(browseCatalogGroups(groups, "", true, "tr"), [group]);
});

test("a cached remote catalog keeps new bundled songs without duplicating IDs", () => {
  const remote = { id: "shared", title: "Latest score" };
  const old = { id: "shared", title: "Bundled score" };
  const bundled = { id: "new", title: "New score" };
  assert.deepEqual(withBundledCatalogSongs([remote], [old, bundled]), [remote, bundled]);
});

test("the bundled whistle tunes are approved, playable and included in the published catalog", async () => {
  const [bundled, catalog] = await Promise.all(["whistle-tunes.json", "catalog.json"].map(async name =>
    JSON.parse(await readFile(new URL(`../catalog/${name}`, import.meta.url), "utf8"))));
  assert.ok(bundled.songs.length >= 5);
  for (const song of bundled.songs) {
    assert.deepEqual(catalog.songs.find(entry => entry.id === song.id), song);
    assert.equal(isApprovedCatalogSong(song), true);
    assert.equal(assessSongQuality(song).readiness, "ready");
    assert.ok(song.sources.some(source => source.role === "cross-check"));
    for (const note of song.notes.split(/[\s|]+/)) {
      assert.ok(fingeringFor(note.slice(0, -1), Number(note.at(-1))), `${song.title} can play ${note}`);
    }
  }
});

test("the screen and game themes appear in Approved with timed whistle excerpts", async () => {
  const { songs } = JSON.parse(await readFile(new URL("../catalog/catalog.json", import.meta.url), "utf8"));
  const excerpts = [
    ["one piece", "whistle-binks-sake"],
    ["zelda", "whistle-zeldas-lullaby"],
    ["frieren", "whistle-frieren-journey-of-a-lifetime"],
  ];
  for (const [query, id] of excerpts) {
    const song = browse(songs, query, true, "en").find(result => result.id === id);
    assert.ok(song?.excerpt, `${query} has an approved excerpt`);
    const phraseLengths = song.notes.split("|").map(phrase => phrase.trim().split(/\s+/).length);
    assert.deepEqual(song.rhythm.durations.map(phrase => phrase.length), phraseLengths);
    assert.ok(song.rhythm.durations.flat().every(duration => duration > 0));
    if (id === "whistle-binks-sake") {
      assert.equal(song.rhythm.bpm, 168);
      assert.deepEqual(phraseLengths, [7, 7, 7, 5, 7, 7, 7, 5]);
      assert.equal(song.notes.split(" | ")[0], "D5 B4 A4 G4 E4 F#4 G4");
      assert.equal(song.notes.split(" | ").at(-1), "B4 G4 A4 A4 G4");
      assert.ok(song.rhythm.durations.every(measure => Math.abs(measure.reduce((sum, beat) => sum + beat, 0) - 4) < 1e-6));
    }
  }
});
