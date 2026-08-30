import assert from "node:assert/strict";
import test from "node:test";
import {
  guitarProScoreToTimedPhrases, midiToScientificPitch, selectSongsterrTrack,
} from "../scripts/songsterr-processing.mjs";

function beat(start, duration, notes) {
  return { absolutePlaybackStart: start, playbackDuration: duration, notes };
}

function note(realValue, options = {}) {
  return { realValue, isVisible: true, isDead: false, isTieDestination: false, ...options };
}

function track(bars) {
  return { staves: [{ bars: bars.map((beats) => ({ voices: [{ beats }] })) }] };
}

test("MIDI perdelerini bilimsel nota adlarına çevirir", () => {
  assert.equal(midiToScientificPitch(60), "C4");
  assert.equal(midiToScientificPitch(69), "A4");
  assert.equal(midiToScientificPitch(127), "G9");
});

test("Songsterr'ın popüler gitar kanalını bas ve davul yerine seçer", () => {
  const score = { tracks: [{}, {}] };
  const meta = {
    popularTrackGuitar: 1,
    tracks: [
      { instrument: "Electric Bass (finger)" },
      { instrument: "Acoustic Guitar (steel)" },
    ],
  };
  assert.equal(selectSongsterrTrack(meta, score), 1);
  assert.equal(selectSongsterrTrack(meta, score, 0), 1);
});

test("Guitar Pro akorlarının üst sesini süre ve bağlarıyla melodiye dönüştürür", () => {
  const emptyBars = Array.from({ length: 3 }, () => []);
  const melodicTrack = track([
    [
      beat(0, 960, [note(60), note(64)]),
      beat(960, 480, [note(67)]),
      beat(1440, 480, [note(67, { isTieDestination: true })]),
    ],
    ...emptyBars,
    [beat(3840, 480, [note(69)])],
  ]);
  const result = guitarProScoreToTimedPhrases(
    { tempo: 94, tracks: [{ staves: [] }, melodicTrack] },
    {
      popularTrackGuitar: 1,
      tracks: [{ instrument: "Electric Bass" }, { instrument: "Lead Guitar" }],
    },
  );

  assert.equal(result.trackIndex, 1);
  assert.equal(result.tempo, 94);
  assert.deepEqual(result.phrases, [["E4", "G4"], ["A4"]]);
  assert.deepEqual(result.durations, [[1, 1], [0.5]]);
  assert.deepEqual(result.gaps, [[0, 0], [0]]);
});
