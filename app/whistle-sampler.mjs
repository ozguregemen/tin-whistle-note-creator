const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
});

export const WHISTLE_SAMPLE_ZONES = Object.freeze([
  Object.freeze({ file: "audio/tin-whistle/81_v0-127_rr1.wav", rootMidi: 81, lowMidi: 57, highMidi: 83 }),
  Object.freeze({ file: "audio/tin-whistle/85_v0-127_rr1.wav", rootMidi: 85, lowMidi: 84, highMidi: 109 }),
]);

export function midiForNote(pitch, octave) {
  const pitchClass = PITCH_CLASS[pitch];
  if (pitchClass === undefined || !Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + pitchClass;
}

export function sampleZoneForMidi(midi) {
  if (!Number.isFinite(midi)) return null;
  return WHISTLE_SAMPLE_ZONES.find((zone) => midi >= zone.lowMidi && midi <= zone.highMidi)
    ?? WHISTLE_SAMPLE_ZONES.reduce((nearest, zone) => (
      Math.abs(zone.rootMidi - midi) < Math.abs(nearest.rootMidi - midi) ? zone : nearest
    ));
}

export function playbackRateForMidi(midi, rootMidi) {
  if (!Number.isFinite(midi) || !Number.isFinite(rootMidi)) return 1;
  return 2 ** ((midi - rootMidi) / 12);
}
