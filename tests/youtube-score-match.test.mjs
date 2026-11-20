import assert from "node:assert/strict";
import test from "node:test";
import { findYoutubeScoreMatches, prepareYoutubeSelection, youtubeScoreMatch, youtubeScoreQueries } from "../app/youtube-score-match.mjs";
import { youtubeSongFromVideo } from "../app/youtube-song.mjs";

const noMatches = { catalog: [], sources: [], tunes: [] };
const unused = async () => assert.fail("This step should be skipped");

test("video labels are removed while titles and optional theme terms remain searchable", () => {
  const video = youtubeSongFromVideo({ title: "Deniz Erdem - Mavi Kuş Full HD [Official Video]" });
  assert.deepEqual(video, { title: "Mavi Kuş", artist: "Deniz Erdem" });
  assert.deepEqual(youtubeScoreQueries("Mavi Kuş Full HD"), ["Mavi Kuş"]);
  assert.deepEqual(youtubeScoreQueries("Silver Fox Theme Song | Piano Tutorials"), ["Silver Fox Theme Song", "Silver Fox"]);
  assert.ok(youtubeScoreMatch({ title: "Silver Fox Theme Song" }, { title: "The Silver Fox Theme" }));
  assert.ok(youtubeScoreMatch(video, { title: "Mavi Kus Notaları ve Tab" }));
});

test("song identity uses artist evidence and allows a small typo without accepting partial titles", () => {
  assert.ok(youtubeScoreMatch({ title: "Silvre Fox" }, { title: "Silver Fox" }));
  assert.ok(youtubeScoreMatch({ title: "Lost Star" }, { title: "Out Tonight", aliases: ["Lost Star"] }));
  assert.equal(youtubeScoreMatch({ title: "Silver Fox" }, { title: "Silver Fox Ride" }), 0);
  assert.equal(youtubeScoreMatch({ title: "Silver Fox" }, { title: "Brown Fox" }), 0);
  assert.equal(youtubeScoreMatch({ title: "Life" }, { title: "Like" }), 0);
  assert.equal(youtubeScoreMatch({ title: "Silver Fox Opening Theme" }, { title: "Silver Fox Ending Theme" }), 0);
  const video = { title: "Mavi Kuş", artist: "Deniz Erdem" };
  assert.equal(youtubeScoreMatch(video, { title: "Mavi Kuş", artist: "Ece Erdem" }), 0);
  assert.ok(youtubeScoreMatch(video, { title: "Deniz Erdem — Mavi Kuş", artist: "Deniz Erdem" }));
});

test("all catalog songs are eligible and a strong catalog result skips the online lookup and download", async () => {
  const song = { title: "Mavi Kuş Full HD" };
  const draft = { id: "draft", title: "Mavi Kuş", notes: "D E F#", sourceStatus: "live" };
  const result = await prepareYoutubeSelection({
    resolveSong: async () => song,
    findScores: video => findYoutubeScoreMatches(video, [draft], { searchSources: unused, searchSession: unused }),
    download: unused,
  });
  assert.deepEqual(result.matches, { ...noMatches, catalog: [draft] });
  assert.equal(result.audio, null);
});

test("online sources are queried with both title variants, deduplicated, and filtered before download", async () => {
  const song = { title: "Silver Fox Theme Song" };
  const calls = [];
  const score = { id: "score", title: "Silver Fox", processingMode: "gp" };
  const irrelevant = { id: "extra", title: "Silver Fox Ride", processingMode: "gp" };
  const result = await prepareYoutubeSelection({
    resolveSong: async () => song,
    findScores: video => findYoutubeScoreMatches(video, [], {
      searchSources: async query => { calls.push(query); return [irrelevant, score]; },
      searchSession: async () => { throw new Error("Provider unavailable"); },
    }),
    download: unused,
  });
  assert.deepEqual(calls, ["Silver Fox Theme Song", "Silver Fox"]);
  assert.deepEqual(result.matches, { ...noMatches, sources: [score] });
});

test("no match and an explicit audio choice preserve the audio flow", async () => {
  const song = { title: "Mavi Kuş" };
  const audio = {};
  const download = async () => ({ audio, song: null });
  assert.deepEqual(await prepareYoutubeSelection({
    resolveSong: async () => song, findScores: async () => noMatches, download,
  }), { matches: null, song, audio });
  assert.deepEqual(await prepareYoutubeSelection({
    song, skipScores: true, resolveSong: unused, findScores: unused, download,
  }), { matches: null, song, audio });
});

test("metadata found only after download is checked before the audio can be transcribed", async () => {
  const song = { title: "Mavi Kuş" };
  const matches = { ...noMatches, tunes: [{ id: 2, name: "Mavi Kuş" }] };
  const audio = {};
  assert.deepEqual(await prepareYoutubeSelection({
    resolveSong: async () => null,
    download: async () => ({ audio, song }),
    findScores: async identity => { assert.equal(identity, song); return matches; },
  }), { matches, song, audio });
});
