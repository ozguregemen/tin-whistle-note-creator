import assert from 'node:assert/strict';
import test from 'node:test';
import * as tf from '@tensorflow/tfjs';
import * as decoder from '@spotify/basic-pitch';
import { mixAudioChannels, inferBasicPitchWindow, basicPitchEvidence, basicPitchEvidenceFromPcm } from '../app/basic-pitch-provider.mjs';
import { transcribeAudioToMelody, transcribePcmToMelody } from '../app/audio-transcription.mjs';

const zeroModel = { execute: () => [tf.zeros([1, 172, 88]), tf.zeros([1, 172, 88]), tf.zeros([1, 172, 264])] };
test('stereo is explicitly averaged to mono without mutating channels', () => {
  const left = new Float32Array([1, 0.5, -1]), right = new Float32Array([0, -0.5, 1]);
  assert.deepEqual([...mixAudioChannels([left, right])], [0.5, 0, 0]);
  assert.equal(left[0], 1);
  assert.throws(() => mixAudioChannels([left, new Float32Array(1)]));
});
test('provider inference owns and disposes tensors on success and model failure', async () => {
  await tf.ready();
  const before = tf.memory().numTensors;
  for (let i = 0; i < 2; i++) {
    const output = await inferBasicPitchWindow(new Float32Array(22050), { tf, model: zeroModel });
    assert.equal(output.frames.length, 86); assert.equal(output.contours[0].length, 264);
    assert.equal(tf.memory().numTensors, before);
  }
  await assert.rejects(inferBasicPitchWindow(new Float32Array(22050), { tf, model: { execute() { tf.ones([3]); throw new Error('model failure'); } } }), /model failure/);
  assert.equal(tf.memory().numTensors, before);
});
test('owned runner matches Basic Pitch window trim and frame ordering', async () => {
  let invocation = 0;
  const model = { execute() { return [88, 88, 264].map((width) => tf.fill([1, 172, width], invocation++)); } };
  const pcm = new Float32Array(22050 * 3);
  const owned = await inferBasicPitchWindow(pcm, { tf, model });
  invocation = 0;
  const expected = { frames: [], onsets: [], contours: [] };
  // The legacy public runner leaks; isolate only this comparator's temporaries.
  tf.engine().startScope();
  try {
    await new decoder.BasicPitch(Promise.resolve(model)).evaluateModel(pcm, (f, o, c) => {
      expected.frames.push(...f); expected.onsets.push(...o); expected.contours.push(...c);
    }, () => {});
    assert.deepEqual(owned, expected);
  } finally { tf.engine().endScope(); }
});
test('evidence retains onset/contour support and library frame-to-time mapping', () => {
  const frames = Array.from({ length: 200 }, () => Array(88).fill(0));
  const onsets = frames.map((f) => [...f]), contours = frames.map(() => Array(264).fill(0));
  onsets[172][48] = 0.9;
  for (let i = 172; i < 192; i++) { frames[i][48] = 0.8; contours[i][144] = 0.7; }
  const fakeDecoder = { outputToNotesPoly: () => [{ startFrame: 172, durationFrames: 20, pitchMidi: 69, amplitude: 0.8 }], noteFramesToTime: decoder.noteFramesToTime };
  const [event] = basicPitchEvidence({ frames, onsets, contours }, fakeDecoder);
  assert.equal(event.onsetConfidence, 0.9);
  assert.ok(Math.abs(event.contourSupport - 0.7) < 1e-6);
  assert.equal(event.startTimeSeconds, decoder.noteFramesToTime([{ startFrame: 172, durationFrames: 20 }])[0].startTimeSeconds);
});
test('chunk overlap crops evidence once and keeps a sustained melody across seam', async () => {
  const runtime = { tf, model: zeroModel, decoder: {
    outputToNotesPoly: (frames) => [{ startFrame: 0, durationFrames: frames.length, pitchMidi: 69, amplitude: 0.9 }],
    noteFramesToTime: (raw) => raw.map((n) => ({ pitchMidi: 69, amplitude: 0.9, startTimeSeconds: 0, durationSeconds: n.durationFrames / 86 })),
  } };
  // Force contour evidence to match this stub's note evidence.
  runtime.model = { execute: () => [tf.fill([1, 172, 88], 0.9), tf.zeros([1, 172, 88]), tf.fill([1, 172, 264], 0.9)] };
  const evidence = await basicPitchEvidenceFromPcm(new Float32Array(22050 * 14), { runtime });
  assert.equal(evidence.events.length, 2);
  assert.equal(evidence.events[0].durationSeconds, 12);
  assert.equal(evidence.events[1].startTimeSeconds, 12);
  assert.equal(evidence.events[1].onsetConfidence, null);
  assert.equal(evidence.diagnostics.tensorsBefore, evidence.diagnostics.tensorsAfter);
  const melody = await transcribePcmToMelody(new Float32Array(1), { provider: async () => evidence });
  assert.equal(melody.notes.length, 1); assert.ok(melody.notes[0].durationSeconds > 13.98);
});
test('provider rejects wrong rate and releases its busy guard after failure', async () => {
  await assert.rejects(basicPitchEvidenceFromPcm(new Float32Array(10), { sampleRate: 44100 }), /22050/);
  await assert.rejects(basicPitchEvidenceFromPcm(new Float32Array(2205), { runtime: { tf, model: { execute() { throw new Error('broken'); } } } }), /broken/);
  const result = await basicPitchEvidenceFromPcm(new Float32Array(2205), { runtime: { tf, model: zeroModel, decoder } });
  assert.deepEqual(result.events, []);
});
test('browser decoder mixes stereo before neutral provider and always closes context', async () => {
  const original = globalThis.AudioContext;
  let closed = 0, failDecode = false;
  globalThis.AudioContext = class {
    async decodeAudioData() {
      if (failDecode) throw new Error('corrupt audio');
      return { duration: 1, sampleRate: 22050, numberOfChannels: 2, getChannelData: (i) => new Float32Array([i ? 0 : 1]) };
    }
    async close() { closed++; }
  };
  try {
    const result = await transcribeAudioToMelody(new Blob(['audio']), () => {}, { modelUrl: 'local-test', provider: async (pcm) => {
      assert.equal(pcm[0], 0.5);
      return { provider: 'test', events: [{ midi: 81, startSeconds: 0, durationSeconds: 1, salience: 0.9 }], diagnostics: {} };
    } });
    assert.equal(result.notes[0].midi, 81); assert.equal(result.pitchConvention, 'concert-midi');
    assert.equal(closed, 1);
    failDecode = true;
    await assert.rejects(transcribeAudioToMelody(new Blob(['broken'])), /corrupt audio/);
    assert.equal(closed, 2);
  } finally { globalThis.AudioContext = original; }
});

test('browser decode resamples unexpected sample rates and rejects overlong audio before inference', async () => {
  const audio = globalThis.AudioContext, offline = globalThis.OfflineAudioContext;
  let closed = 0, duration = 1, resampled = 0;
  globalThis.AudioContext = class {
    async decodeAudioData() { return { duration, sampleRate: 44100, numberOfChannels: 1 }; }
    async close() { closed++; }
  };
  globalThis.OfflineAudioContext = class {
    constructor(channels, length, sampleRate) {
      assert.deepEqual([channels, length, sampleRate], [1, 22050, 22050]);
    }
    createBufferSource() { return { connect() {}, start() {} }; }
    async startRendering() { resampled++; return { numberOfChannels: 1, getChannelData: () => new Float32Array(22050).fill(0.25) }; }
  };
  try {
    const options = { modelUrl: 'test', provider: async (pcm, options) => {
      assert.equal(options.sampleRate, 22050); assert.equal(pcm.length, 22050); assert.equal(pcm[0], 0.25);
      return { events: [], provider: 'test', diagnostics: {} };
    } };
    await transcribeAudioToMelody(new Blob(['audio']), () => {}, options);
    assert.equal(resampled, 1); assert.equal(closed, 1);
    duration = 601;
    await assert.rejects(transcribeAudioToMelody(new Blob(['long']), () => {}, options), /10 minutes/);
    assert.equal(resampled, 1); assert.equal(closed, 2);
  } finally { globalThis.AudioContext = audio; globalThis.OfflineAudioContext = offline; }
});
