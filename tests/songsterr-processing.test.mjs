import assert from "node:assert/strict";
import test from "node:test";
import {
  guitarProScoreToTimedPhrases, midiToScientificPitch, rankSongsterrTrackIndices,
  selectBestSongsterrParsedTrack, selectSongsterrTrack, songsterrTrackJsonToTimedPhrases,
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

test("Songsterr null vokal indeksini sıfırıncı kanal sanmaz", () => {
  const score = { tracks: [{}, {}] };
  const meta = {
    popularTrackVocals: null,
    popularTrackGuitar: 0,
    tracks: [
      { name: "Rhythm Guitar", instrument: "Distortion Guitar" },
      { name: "Lead Guitar", instrument: "Overdriven Guitar" },
    ],
  };

  assert.deepEqual(rankSongsterrTrackIndices(meta, score, 0), [1, 0]);
  assert.equal(selectSongsterrTrack(meta, score, 0), 1);
});

test("Songsterr vokal kanalını tercih edilen gitar kanalının önüne alır", () => {
  const score = { tracks: [{}, {}] };
  const meta = {
    popularTrackVocals: 1,
    popularTrackGuitar: 0,
    tracks: [
      { name: "Lead Guitar", instrument: "Distortion Guitar" },
      { name: "Vocals", instrument: "Tenor Sax" },
    ],
  };

  assert.equal(selectSongsterrTrack(meta, score, 0), 1);
});

test("kanal adları belirsizse tekrarlı akor kanalından melodik kanalı ayırır", () => {
  const meta = {
    popularTrackVocals: null,
    popularTrackGuitar: 0,
    tracks: [
      { name: "Guitar 1", instrument: "Electric Guitar" },
      { name: "Guitar 2", instrument: "Electric Guitar" },
    ],
  };
  const rhythm = {
    phrases: [["E3", "E3", "E3", "E3", "E3", "E3", "E3", "E3"]],
    metrics: {
      noteCount: 8,
      uniquePitches: 1,
      pitchSpan: 0,
      dominantPitchRatio: 1,
      consecutiveRepeatRatio: 1,
      notesPerBar: 8,
      chordRatio: 1,
    },
  };
  const melody = {
    phrases: [["C4", "D4", "E4", "G4", "A4", "G4", "E4", "D4"]],
    metrics: {
      noteCount: 8,
      uniquePitches: 5,
      pitchSpan: 9,
      dominantPitchRatio: 0.25,
      consecutiveRepeatRatio: 0,
      notesPerBar: 4,
      chordRatio: 0,
    },
  };

  const selected = selectBestSongsterrParsedTrack([
    { trackIndex: 0, parsed: rhythm },
    { trackIndex: 1, parsed: melody },
  ], meta, 0);

  assert.equal(selected.trackIndex, 1);
  assert.deepEqual(selected.parsed.phrases, melody.phrases);
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

test("Songsterr'ın kaynak dosyası olmayan parça JSON'unu melodiye dönüştürür", () => {
  const result = songsterrTrackJsonToTimedPhrases(
    {
      tuning: [64, 59, 55, 50, 45, 40],
      measures: [{
        signature: [4, 4],
        voices: [{ beats: [
          { duration: [1, 4], notes: [{ fret: 0, string: 1 }] },
          { duration: [1, 8], rest: true, notes: [{ rest: true }] },
          { duration: [1, 8], notes: [{ fret: 2, string: 1 }, { fret: 4, string: 2 }] },
          { duration: [1, 2], notes: [{ fret: 2, string: 1, tie: true }] },
        ] }],
      }],
    },
    { tracks: [{ instrument: "Lead Guitar" }] },
    0,
  );

  assert.deepEqual(result.phrases, [["B3", "C#4"]]);
  assert.deepEqual(result.durations, [[1, 2.5]]);
  assert.deepEqual(result.gaps, [[0, 0.5]]);
  assert.equal(result.trackIndex, 0);
});
