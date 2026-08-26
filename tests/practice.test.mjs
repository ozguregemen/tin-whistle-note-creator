import assert from "node:assert/strict";
import test from "node:test";

import { parseAbcScore } from "../app/abc.mjs";
import { buildPlaybackPlan, frequencyForNote } from "../app/practice.mjs";

test("ABC nota uzunluklarını perde dizisiyle birlikte okur", () => {
  const score = parseAbcScore("D2 E/2 F3/2 ^G", "D");
  assert.equal(score.notes, "D4 E4 F#4 G#4");
  assert.deepEqual(score.rhythm.durations, [[2, 0.5, 1.5, 1]]);
});

test("pratik planı gerçek süreleri ve nota öncesi esleri milisaniyeye çevirir", () => {
  const phrases = [[{ pitch: "A", octave: 4 }, { pitch: "B", octave: 4 }]];
  const plan = buildPlaybackPlan(phrases, { durations: [[1, 0.5]], gaps: [[0, 1]] }, 120);
  assert.deepEqual(plan.map(({ durationMs, delayMs }) => ({ durationMs, delayMs })), [
    { durationMs: 500, delayMs: 0 },
    { durationMs: 250, delayMs: 500 },
  ]);
});

test("ritim verisi olmayan eski katalog kayıtlarına eşit vuruş uygular", () => {
  const plan = buildPlaybackPlan([[{ pitch: "D", octave: 4 }]], undefined, 60);
  assert.equal(plan[0].durationMs, 1000);
  assert.equal(plan[0].delayMs, 0);
  assert.ok(Math.abs(frequencyForNote("A", 4) - 440) < 0.001);
});
