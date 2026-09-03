import assert from "node:assert/strict";
import test from "node:test";
import { replacePhraseNote, serializeNotePhrases } from "../app/note-corrections.mjs";

test("tek nota düzeltmesi cümleleri, sırayı ve nota sayısını değiştirmez", () => {
  const phrases = [
    [{ pitch: "D", octave: 4 }, { pitch: "E", octave: 4 }],
    [{ pitch: "F#", octave: 4 }],
  ];
  const corrected = replacePhraseNote(phrases, 0, 1, { pitch: "F", octave: 4 });
  assert.equal(phrases[0][1].pitch, "E");
  assert.equal(corrected.flat().length, phrases.flat().length);
  assert.equal(serializeNotePhrases(corrected), "D4 F4 | F#4");
});
