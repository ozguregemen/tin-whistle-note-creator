import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptPhrasesToDWhistle,
  bestWhistleOctaveShift,
  fingeringFor,
} from "../app/fingerings.mjs";

test("Clarke D kromatik tablosundaki yarım delik notalarını destekler", () => {
  assert.equal(fingeringFor("D#", 4), "11111h");
  assert.equal(fingeringFor("F", 4), "1111h0");
  assert.equal(fingeringFor("F", 5), "1111h0");
  assert.equal(fingeringFor("G#", 5), "11h000");
});

test("çapraz parmak kullanılan kromatik notaları destekler", () => {
  assert.equal(fingeringFor("A#", 4), "101111");
  assert.equal(fingeringFor("C", 5), "011000");
  assert.equal(fingeringFor("C#", 6), "000000");
});

test("uzatılmış üst register parmaklarını kullanır", () => {
  assert.equal(fingeringFor("D", 6), "011111");
  assert.equal(fingeringFor("E", 6), "111111");
  assert.equal(fingeringFor("F#", 6), "111101");
  assert.equal(fingeringFor("G", 6), "111001");
});

test("melodiyi değiştirmeden çalınabilir whistle oktavına taşır", () => {
  const phrases = [[
    { pitch: "G", octave: 3, token: "G3", display: "G" },
    { pitch: "F", octave: 4, token: "F4", display: "F" },
  ]];

  assert.equal(bestWhistleOctaveShift(phrases.flat()), 12);
  assert.deepEqual(adaptPhrasesToDWhistle(phrases), [[
    { pitch: "G", octave: 4, token: "G3", display: "G", holes: "111000" },
    { pitch: "F", octave: 5, token: "F4", display: "F", holes: "1111h0" },
  ]]);
});

test("zaten uygun registerdaki melodiyi yerinde bırakır", () => {
  const phrases = [[
    { pitch: "D", octave: 4 },
    { pitch: "C#", octave: 5 },
    { pitch: "D", octave: 5 },
  ]];

  assert.equal(bestWhistleOctaveShift(phrases.flat()), 0);
});
