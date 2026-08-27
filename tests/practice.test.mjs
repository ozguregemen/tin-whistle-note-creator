import assert from "node:assert/strict";
import test from "node:test";

import { parseAbcScore } from "../app/abc.mjs";
import { buildPhraseRanges, buildPlaybackPlan, frequencyForNote, nextPlaybackIndex, noteNeedsFollowing, remainingBeatsAfterElapsed } from "../app/practice.mjs";
import { base64AudioBuffer, midiForNote, playbackRateForMidi, sampleZoneForMidi, soundfontLoopForZone, soundfontZoneForMidi } from "../app/whistle-sampler.mjs";

test("ABC nota uzunluklarını perde dizisiyle birlikte okur", () => {
  const score = parseAbcScore("D2 E/2 F3/2 ^G", "D");
  assert.equal(score.notes, "D4 E4 F#4 G#4");
  assert.deepEqual(score.rhythm.durations, [[2, 0.5, 1.5, 1]]);
  assert.equal(score.rhythm.tempoSource, "default");
});

test("ABC Q alanındaki gerçek tempoyu okur", () => {
  const score = parseAbcScore("Q:1/4=126\nD E F G", "D");
  assert.equal(score.rhythm.bpm, 126);
  assert.equal(score.rhythm.tempoSource, "score");
});

test("pratik planı gerçek süreleri ve nota öncesi esleri milisaniyeye çevirir", () => {
  const phrases = [[{ pitch: "A", octave: 4 }, { pitch: "B", octave: 4 }]];
  const plan = buildPlaybackPlan(phrases, { durations: [[1, 0.5]], gaps: [[0, 1]] }, 120);
  assert.deepEqual(plan.map(({ durationMs, delayMs }) => ({ durationMs, delayMs })), [
    { durationMs: 500, delayMs: 0 },
    { durationMs: 250, delayMs: 500 },
  ]);
  assert.deepEqual(plan.map(({ durationBeats, delayBeats }) => ({ durationBeats, delayBeats })), [
    { durationBeats: 1, delayBeats: 0 },
    { durationBeats: 0.5, delayBeats: 1 },
  ]);
});

test("ritim verisi olmayan eski katalog kayıtlarına eşit vuruş uygular", () => {
  const plan = buildPlaybackPlan([[{ pitch: "D", octave: 4 }]], undefined, 60);
  assert.equal(plan[0].durationMs, 1000);
  assert.equal(plan[0].delayMs, 0);
  assert.ok(Math.abs(frequencyForNote("A", 4) - 440) < 0.001);
});

test("tempo değişirken geçen süreyi vuruş cinsinden korur", () => {
  assert.equal(remainingBeatsAfterElapsed(2, 500, 120), 1);
  assert.equal(remainingBeatsAfterElapsed(1, 2000, 120), 0);
});

test("cümle aralıklarını genel nota sırasına çevirir", () => {
  assert.deepEqual(buildPhraseRanges([[1, 2], [3], [4, 5, 6]]), [
    { start: 0, end: 2 },
    { start: 2, end: 3 },
    { start: 3, end: 6 },
  ]);
});

test("seçilen cümlenin sonunda başına döner, döngü yoksa şarkıyı bitirir", () => {
  assert.equal(nextPlaybackIndex(2, 6, { start: 1, end: 3 }), 1);
  assert.equal(nextPlaybackIndex(4, 6, null), 5);
  assert.equal(nextPlaybackIndex(5, 6, null), -1);
});

test("aktif nota görünür çalışma alanının dışına çıkınca takip ister", () => {
  assert.equal(noteNeedsFollowing(180, 320, 120, 720), false);
  assert.equal(noteNeedsFollowing(100, 240, 120, 720), true);
  assert.equal(noteNeedsFollowing(650, 760, 120, 720), true);
});

test("tin whistle örnek bölgesini seçer ve hedef perde hızını hesaplar", () => {
  assert.equal(midiForNote("D", 4), 62);
  assert.equal(sampleZoneForMidi(62).rootMidi, 81);
  assert.equal(sampleZoneForMidi(84).rootMidi, 85);
  assert.equal(playbackRateForMidi(81, 81), 1);
  assert.ok(Math.abs(playbackRateForMidi(69, 81) - 0.5) < 0.0001);
});

test("Irish tin-whistle ses bankası yakın perde bölgesini ve döngüsünü kullanır", () => {
  const zones = [
    { originalPitch: 6400, keyRangeLow: 0, keyRangeHigh: 78, loopStart: 6431, loopEnd: 11603, sampleRate: 22050, coarseTune: 0, fineTune: 0 },
    { originalPitch: 7400, keyRangeLow: 86, keyRangeHigh: 89, loopStart: 2781, loopEnd: 5578, sampleRate: 22050, coarseTune: 0, fineTune: -20 },
  ];
  assert.equal(soundfontZoneForMidi(62, zones), zones[0]);
  assert.equal(soundfontZoneForMidi(90, zones), null);
  assert.ok(Math.abs(playbackRateForMidi(62, zones[0]) - 2 ** ((6200 - 6400) / 1200)) < 0.0001);
  assert.deepEqual(soundfontLoopForZone(zones[0]), { start: 6431 / 22050, end: 11603 / 22050 });
  assert.deepEqual(Array.from(new Uint8Array(base64AudioBuffer("AQID"))), [1, 2, 3]);
});
