import assert from "node:assert/strict";
import test from "node:test";
import { browseCatalogSongs } from "../app/catalog-browse.mjs";

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

test("approved view includes cross-checked melodies with estimated rhythm and excludes drafts", () => {
  const songs = [live, audioDraft, unchecked, approved];
  assert.deepEqual(browseCatalogSongs(songs, "", true, "tr"), [approved]);
  assert.deepEqual(browseCatalogSongs(songs, "", false, "tr"), [approved, live, unchecked, audioDraft]);
});

test("catalog filters by partial title, artist, and alias without requiring Turkish diacritics", () => {
  const songs = [live, approved];
  assert.deepEqual(browseCatalogSongs(songs, "aks dum", true, "tr"), [approved]);
  assert.deepEqual(browseCatalogSongs(songs, "icerim", true, "en"), [approved]);
  assert.deepEqual(browseCatalogSongs(songs, "nilu ruzg", false, "tr"), [live]);
  assert.deepEqual(browseCatalogSongs(songs, "nilu", true, "tr"), []);
});
