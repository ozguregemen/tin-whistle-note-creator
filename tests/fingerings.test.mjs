import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptPhrasesToDWhistle,
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

test("metin notalarının registerını tek tek yukarı itmek yerine bütün ezgiye bakarak tahmin eder", () => {
  const estimated = estimateDWhistleRegisters([
    ["E", "E", "F", "E", "A", "E"].map((pitch) => ({ pitch })),
    ["D", "E", "D"].map((pitch) => ({ pitch })),
    ["C", "D", "C"].map((pitch) => ({ pitch })),
    ["B", "C", "B", "A"].map((pitch) => ({ pitch })),
  ]);

  assert.deepEqual(estimated.map((phrase) => phrase.map((note) => `${note.pitch}${note.octave}`)), [
    ["E5", "E5", "F5", "E5", "A5", "E5"],
    ["D5", "E5", "D5"],
    ["C5", "D5", "C5"],
    ["B4", "C5", "B4", "A4"],
  ]);
});

test("Caddelerde Rüzgar aralığını üst E yerine en fazla üst D kullanacak biçimde aktarır", () => {
  const source = estimateDWhistleRegisters([
    ["E", "E", "F", "E", "A", "E"].map((pitch) => ({ pitch })),
    ["D", "E", "D"].map((pitch) => ({ pitch })),
    ["C", "D", "C"].map((pitch) => ({ pitch })),
    ["B", "C", "B", "A"].map((pitch) => ({ pitch })),
  ]);
  const adapted = adaptPhrasesToDWhistle(source).flat();

  assert.equal(bestWhistleSemitoneShift(source.flat()), -7);
  assert.equal(adapted[0].pitch, "A");
  assert.equal(adapted[0].octave, 4);
  assert.equal(Math.max(...adapted.map((note) => note.octave * 12 + ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(note.pitch))), 62);
});

test("C#5 ilk registerda, D5 ise üst registerda gösterilir", () => {
  assert.equal(isUpperWhistleRegister("C#", 5), false);
  assert.equal(isUpperWhistleRegister("D", 5), true);
});
