import assert from "node:assert/strict";
import test from "node:test";
import { describeLiveNote } from "../app/live-note-display.mjs";

test("live notes retain pitch codes and show familiar fixed-do names", () => {
  for (const [pitch, octave, code, name] of [
    ["A", 5, "A5", "La"],
    ["G", 5, "G5", "Sol"],
    ["A#", 5, "B♭5", "Si bemol"],
    ["C", 6, "C6", "Do"],
    ["F", 5, "F5", "Fa"],
    ["F#", 5, "F♯5", "Fa diyez"],
  ]) {
    const display = describeLiveNote({ pitch, octave }, "tr");
    assert.equal(display.sounding, code);
    assert.equal(display.name, name);
  }
  assert.equal(describeLiveNote({ pitch: "A#", octave: 5 }, "en").name, "Si flat");
});

test("the live diagram uses the correct written register and counts covered holes", () => {
  const low = describeLiveNote({ pitch: "D", octave: 5 }, "tr");
  assert.equal(low.written, "D4");
  assert.deepEqual(low.holes, Array(6).fill("closed"));
  assert.deepEqual(low.counts, { closed: 6, half: 0, open: 0 });

  const upper = describeLiveNote({ pitch: "D", octave: 6 }, "tr");
  assert.equal(upper.written, "D5");
  assert.deepEqual(upper.holes, ["open", ...Array(5).fill("closed")]);

  const fa = describeLiveNote({ pitch: "F", octave: 5 }, "tr");
  assert.deepEqual(fa.holes, ["closed", "closed", "closed", "closed", "half", "open"]);
  assert.deepEqual(fa.counts, { closed: 4, half: 1, open: 1 });
});

test("a pitch outside the high D chart is readable without a suggested fingering", () => {
  const display = describeLiveNote({ pitch: "A", octave: 4 }, "tr");
  assert.equal(display.sounding, "A4");
  assert.equal(display.name, "La");
  assert.equal(display.holes, null);
  assert.equal(display.written, null);
});
