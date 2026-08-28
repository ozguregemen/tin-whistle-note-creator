import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptPhrasesToDWhistle,
  arrangePhrasesForDWhistle,
  bestWhistleOctaveShift,
  bestWhistleSemitoneShift,
  estimateDWhistleRegisters,
  fingeringFor,
  isUpperWhistleRegister,
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
  assert.equal(fingeringFor("D", 4), "111111");
  assert.equal(fingeringFor("D", 5), "011111");
  assert.equal(fingeringFor("D", 6), "011111");
  assert.equal(fingeringFor("E", 6), "111111");
  assert.equal(fingeringFor("F#", 6), "111101");
  assert.equal(fingeringFor("G", 6), "111001");
});

test("melodiyi tek bir sabit aralıkla çalınabilir ve daha alçak whistle bölgesine taşır", () => {
  const phrases = [[
    { pitch: "G", octave: 3, token: "G3", display: "G" },
    { pitch: "F", octave: 4, token: "F4", display: "F" },
  ]];

  assert.equal(bestWhistleOctaveShift(phrases.flat()), 12);
  assert.equal(bestWhistleSemitoneShift(phrases.flat()), 7);
  assert.deepEqual(adaptPhrasesToDWhistle(phrases), [[
    { pitch: "D", octave: 4, token: "G3", display: "G", holes: "111111" },
    { pitch: "C", octave: 5, token: "F4", display: "F", holes: "011000" },
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

test("işaretsiz metin notalarını Clarke tablosunun alt registerında tutar", () => {
  const estimated = estimateDWhistleRegisters([
    ["E", "E", "F", "E", "A", "E"].map((pitch) => ({ pitch })),
    ["D", "E", "D"].map((pitch) => ({ pitch })),
    ["C", "D", "C"].map((pitch) => ({ pitch })),
    ["B", "C", "B", "A"].map((pitch) => ({ pitch })),
  ]);

  assert.deepEqual(estimated.map((phrase) => phrase.map((note) => `${note.pitch}${note.octave}`)), [
    ["E4", "E4", "F4", "E4", "A4", "E4"],
    ["D4", "E4", "D4"],
    ["C5", "D4", "C5"],
    ["B4", "C5", "B4", "A4"],
  ]);
});

test("Caddelerde Rüzgar alt Mi ile başlar ve iki registera sığdığı için tonu değişmez", () => {
  const source = estimateDWhistleRegisters([
    ["E", "E", "F", "E", "A", "E"].map((pitch) => ({ pitch })),
    ["D", "E", "D"].map((pitch) => ({ pitch })),
    ["C", "D", "C"].map((pitch) => ({ pitch })),
    ["B", "C", "B", "A"].map((pitch) => ({ pitch })),
  ]);
  const adapted = adaptPhrasesToDWhistle(source).flat();

  assert.equal(bestWhistleSemitoneShift(source.flat()), 0);
  assert.equal(adapted[0].pitch, "E");
  assert.equal(adapted[0].octave, 4);
});

test("örnek tabdaki işaretsiz B A G E dizisini alt registerda tutar", () => {
  const estimated = estimateDWhistleRegisters([
    ["B", "A", "G", "E", "F#", "G"].map((pitch) => ({ pitch })),
    ["B", "A", "G", "E", "G", "D"].map((pitch) => ({ pitch })),
  ]);

  assert.deepEqual(estimated.map((phrase) => phrase.map((note) => `${note.pitch}${note.octave}`)), [
    ["B4", "A4", "G4", "E4", "F#4", "G4"],
    ["B4", "A4", "G4", "E4", "G4", "D4"],
  ]);
});

test("C#5 ilk registerda, D5 ise üst registerda gösterilir", () => {
  assert.equal(isUpperWhistleRegister("C#", 5), false);
  assert.equal(isUpperWhistleRegister("D", 5), true);
});

test("iki oktavı aşan melodide sınır notalarını en yakın çalınabilir oktava taşır", () => {
  const arrangement = arrangePhrasesForDWhistle([[
    { pitch: "E", octave: 3 },
    { pitch: "A", octave: 3 },
    { pitch: "C", octave: 6 },
    { pitch: "E", octave: 6 },
  ]]);

  assert.equal(arrangement.semitoneShift, 0);
  assert.equal(arrangement.octaveAdjustments, 2);
  assert.deepEqual(arrangement.phrases[0].map((note) => `${note.pitch}${note.octave}`), ["E4", "A4", "C6", "E6"]);
  assert.ok(arrangement.phrases.flat().every((note) => note.holes));
});
