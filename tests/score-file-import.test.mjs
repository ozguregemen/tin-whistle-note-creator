import assert from "node:assert/strict";
import test from "node:test";
import { midiToTimedPhrases, musicXmlToTimedPhrases, timedPhrasesToString } from "../app/score-file-import.mjs";

function chunk(name, data) {
  const length = data.length;
  return [...name].map((character) => character.charCodeAt(0)).concat([
    (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255,
  ], data);
}

function midiFile(tracks, ticksPerQuarter = 96) {
  const header = [0, 1, 0, tracks.length, (ticksPerQuarter >>> 8) & 255, ticksPerQuarter & 255];
  return new Uint8Array(chunk("MThd", header).concat(...tracks.map((track) => chunk("MTrk", track))));
}

test("MIDI içe aktarma melodi kanalını, tempoyu, süreyi ve esi korur", () => {
  const tempoTrack = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0]; // 120 BPM
  const bassTrack = [0, 0xff, 3, 4, 0x42, 0x61, 0x73, 0x73, 0, 0x90, 48, 100, 96, 0x80, 48, 0, 0, 0xff, 0x2f, 0];
  const melodyTrack = [
    0, 0xff, 3, 10, ...[..."Lead Vocal"].map((character) => character.charCodeAt(0)),
    0, 0x90, 69, 100, 96, 0x80, 69, 0,
    48, 0x90, 71, 100, 48, 0x80, 71, 0,
    0, 0xff, 0x2f, 0,
  ];
  const parsed = midiToTimedPhrases(midiFile([tempoTrack, bassTrack, melodyTrack]));
  assert.equal(parsed.trackName, "Lead Vocal");
  assert.equal(parsed.tempo, 120);
  assert.equal(timedPhrasesToString(parsed), "A4 B4");
  assert.deepEqual(parsed.durations, [[1, 0.5]]);
  assert.deepEqual(parsed.gaps, [[0, 0.5]]);
});

test("MIDI içe aktarma vurmalı kanalını melodi olarak seçmez", () => {
  const track = [
    0, 0x99, 60, 100, 24, 0x89, 60, 0,
    0, 0x90, 74, 100, 96, 0x80, 74, 0,
    0, 0xff, 0x2f, 0,
  ];
  assert.equal(timedPhrasesToString(midiToTimedPhrases(midiFile([track]))), "D5");
});

test("MusicXML içe aktarma adlı vokal partisini ve score temposunu seçer", () => {
  const xml = `<?xml version="1.0"?><score-partwise>
    <part-list><score-part id="P1"><part-name>Bass</part-name></score-part><score-part id="P2"><part-name>Lead Vocal</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>C</step><octave>2</octave></pitch><duration>2</duration><voice>1</voice></note></measure></part>
    <part id="P2"><measure number="1"><attributes><divisions>2</divisions></attributes><direction><sound tempo="115"/></direction><note><rest/><duration>1</duration><voice>1</voice></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note><note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note></measure></part>
  </score-partwise>`;
  const parsed = musicXmlToTimedPhrases(xml);
  assert.equal(parsed.trackName, "Lead Vocal");
  assert.equal(parsed.tempo, 115);
  assert.equal(timedPhrasesToString(parsed), "A4 A#4");
  assert.deepEqual(parsed.durations, [[1, 0.5]]);
  assert.deepEqual(parsed.gaps, [[0.5, 0]]);
});

test("bozuk nota dosyaları anlaşılır biçimde reddedilir", () => {
  assert.throws(() => midiToTimedPhrases(new Uint8Array([1, 2, 3])), /valid MIDI/i);
  assert.throws(() => musicXmlToTimedPhrases("<html></html>"), /supported MusicXML/i);
});
