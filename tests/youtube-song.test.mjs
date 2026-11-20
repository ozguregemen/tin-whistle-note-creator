import assert from "node:assert/strict";
import test from "node:test";
import { buildPlaybackPlan, rebaseTranscribedRhythm } from "../app/practice.mjs";
import { readYoutubeSong, youtubeSongFromVideo, youtubeTempoLookupTitle, youtubeTempoMatches, YOUTUBE_SONG_HEADER } from "../app/youtube-song.mjs";

test("YouTube titles retain Unicode and omit recognized video labels", () => {
  assert.deepEqual(youtubeSongFromVideo({ title: "Tarkan – Kuzu Kuzu (Official Video)" }), { title: "Kuzu Kuzu", artist: "Tarkan" });
  assert.deepEqual(youtubeSongFromVideo({ title: "Dönence", author_name: "Barış Manço - Topic" }), { title: "Dönence", artist: "Barış Manço" });
  const theme = youtubeSongFromVideo({ title: "Pink Panther Theme Song | Melodica Academy Tutorials", author_name: "Melodika Akademi" });
  assert.deepEqual(theme, { title: "Pink Panther Theme Song", artist: "" });
  assert.equal(youtubeTempoLookupTitle(theme.title), "Pink Panther Theme");
  assert.equal(youtubeTempoMatches(theme, { title: "The Pink Panther Theme", artist: "Henry Mancini" }), true);
  assert.equal(youtubeTempoMatches({ title: "Dönence", artist: "Barış Manço" }, { title: "Dönence", artist: "Other artist" }), false);
  assert.equal(readYoutubeSong(new Headers({ [YOUTUBE_SONG_HEADER]: "%bad-encoding" })), null);
});

test("a catalog BPM preserves the length of transcribed notes and rests", () => {
  const phrases = [[{ pitch: "D", octave: 4 }]];
  const rhythm = { bpm: 90, source: "transcribed", durations: [[1.5]], gaps: [[0.75]] };
  const rebased = rebaseTranscribedRhythm(rhythm, 117);
  const [before] = buildPlaybackPlan(phrases, rhythm, 90);
  const [after] = buildPlaybackPlan(phrases, rebased, 117);
  assert.ok(Math.abs(before.durationMs - after.durationMs) < 1e-9);
  assert.ok(Math.abs(before.delayMs - after.delayMs) < 1e-9);
});
