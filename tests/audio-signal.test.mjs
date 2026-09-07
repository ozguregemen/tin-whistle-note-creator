import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAudioSignal, supportForEvent, estimatePulse } from '../app/audio-signal.mjs';
import { melodyFromEvents } from '../app/melody-engine.mjs';

const rate = 22050;
function mix(seconds, notes, drums = false) {
  const pcm = new Float32Array(Math.ceil(seconds * rate));
  for (const { midi, start = 0, duration = seconds, amplitude = 0.2, harmonics = 1 } of notes) {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    for (let i = Math.round(start * rate); i < Math.min(pcm.length, (start + duration) * rate); i++) {
      const t = i / rate - start, env = Math.min(1, t / 0.015, (duration - t) / 0.02);
      for (let h = 1; h <= harmonics; h++) pcm[i] += amplitude / h * Math.sin(2 * Math.PI * hz * h * t) * env;
    }
  }
  if (drums) {
    let seed = 42;
    for (let i = 0; i < pcm.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const phase = (i / rate) % 0.5;
      if (phase < 0.025) pcm[i] += (seed / 2 ** 31 - 1) * Math.exp(-phase * 150) * 0.5;
    }
  }
  return pcm;
}

test('signal analysis abstains on silence, handles cancellation and preserves PCM', async () => {
  const pcm = new Float32Array(rate);
  const result = await analyzeAudioSignal(pcm, { sampleRate: rate });
  assert.equal(result.tempo, null);
  assert.equal(supportForEvent(result, { midi: 69, startSeconds: 0, durationSeconds: 1 }), null);
  assert.ok(pcm.every(x => x === 0));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(analyzeAudioSignal(pcm, { sampleRate: rate, signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(analyzeAudioSignal(new Float32Array(), { signal: controller.signal }), { name: 'AbortError' });
  const duringYield = new AbortController();
  await assert.rejects(analyzeAudioSignal(new Float32Array(20), { signal: duringYield.signal,
    onProgress: () => duringYield.abort() }), { name: 'AbortError' });
});

test('spectral harmonic evidence favors the fundamental, not an octave or an unrelated note', async () => {
  for (const midi of [57, 69, 81]) {
    const signal = await analyzeAudioSignal(mix(0.8, [{ midi, harmonics: 5 }]), { sampleRate: rate });
    const support = pitch => supportForEvent(signal, { midi: pitch, startSeconds: 0.15, durationSeconds: 0.5 });
    assert.ok(support(midi) > support(midi + 12), `${midi} must outrank its harmonic`);
    assert.ok(support(midi) > support(midi - 12), `${midi} must outrank a missing subharmonic`);
    assert.ok(support(midi) > support(midi + 1) + 0.15);
  }
});

test('independent audio evidence can reject strong model bass hallucination without deleting real low melodies', async () => {
  const pitches = [67, 69, 71, 69];
  const notes = pitches.map((midi, i) => ({ midi, start: i * 0.5, duration: 0.45, harmonics: 5, amplitude: 0.15 }));
  const pcm = mix(2, [...notes, { midi: 36, amplitude: 0.45 }], true);
  const signal = await analyzeAudioSignal(pcm, { sampleRate: rate });
  const events = notes.flatMap(n => [
    { midi: n.midi, startSeconds: n.start, durationSeconds: n.duration, salience: 0.55, onsetConfidence: 0.8 },
    { midi: 48, startSeconds: n.start, durationSeconds: n.duration, salience: 0.98 },
  ]);
  const before = melodyFromEvents(events);
  const after = melodyFromEvents(events, { acousticEvidence: signal });
  assert.ok(before.notes.some(n => n.midi === 48), 'frozen failure must actually fail before guidance');
  assert.deepEqual(after.notes.map(n => n.midi), pitches);
  const lowSignal = await analyzeAudioSignal(mix(1, [{ midi: 45, harmonics: 4 }]), { sampleRate: rate });
  assert.deepEqual(melodyFromEvents([{ midi: 45, startSeconds: 0, durationSeconds: 1, salience: 0.85 }],
    { acousticEvidence: lowSignal }).notes.map(n => n.midi), [45]);
});

test('pulse estimator measures repeated attacks, not note count, and declines insufficient evidence', () => {
  for (const bpm of [80, 115, 150]) {
    const flux = new Float32Array(2000);
    for (let t = 0.2; t < 20; t += 60 / bpm) flux[Math.round(t * 100)] = 1;
    const tempo = estimatePulse(flux, 100);
    assert.ok(tempo && Math.abs(tempo.bpm - bpm) <= 1, `expected ${bpm}, got ${tempo?.bpm}`);
    assert.equal(tempo.kind, 'pulse-estimate');
    assert.equal(tempo.beatPhaseReliable, false);
  }
  assert.equal(estimatePulse(new Float32Array(2000), 100), null);
  assert.equal(estimatePulse(new Float32Array([0, 1, 0, 1]), 100), null);
});

test('pulse estimates do not lock to third/fourth-time aliases at the actual 50fps signal hop', () => {
  for (const framesPerSecond of [50, 100]) for (const bpm of [40, 60, 80, 100, 115, 120, 150, 160, 180, 200, 220]) {
    const flux = new Float32Array(20 * framesPerSecond);
    for (let t = 0.2; t < 20; t += 60 / bpm) flux[Math.round(t * framesPerSecond)] = 1;
    const tempo = estimatePulse(flux, framesPerSecond);
    assert.ok(tempo && Math.abs(tempo.bpm - bpm) <= 2, `${framesPerSecond}fps / ${bpm} BPM got ${tempo?.bpm}`);
  }
});

test('harmonic lead below a high sine accompaniment and sustained over drums keeps its identity', async () => {
  const signal = await analyzeAudioSignal(mix(2, [{ midi: 64, harmonics: 5, amplitude: 0.2 },
    { midi: 88, amplitude: 0.24 }], true));
  const event = midi => ({ midi, startSeconds: 0.1, durationSeconds: 1.8, salience: 0.7 });
  assert.ok(supportForEvent(signal, event(64)) > supportForEvent(signal, event(88)));
  assert.deepEqual(melodyFromEvents([event(64), event(88)], { acousticEvidence: signal }).notes.map(n => n.midi), [64]);
});

test('rapid chromatic line and real octave change survive acoustic guidance', async () => {
  const notes = [69, 70, 71, 72, 84, 83].map((midi, i) => ({ midi, start: i * 0.12, duration: 0.11, harmonics: 4 }));
  const signal = await analyzeAudioSignal(mix(0.8, notes));
  const events = notes.map(n => ({ midi: n.midi, startSeconds: n.start, durationSeconds: n.duration, salience: 0.95, onsetConfidence: 0.95 }));
  assert.deepEqual(melodyFromEvents(events, { acousticEvidence: signal }).notes.map(n => n.midi), notes.map(n => n.midi));
});

test('rhythmic noise is evidence for pulse, not necessarily for any melody note', async () => {
  const signal = await analyzeAudioSignal(mix(10, [], true));
  assert.ok(signal.tempo && Math.abs(signal.tempo.bpm - 120) < 3);
  const events = Array.from({ length: 18 }, (_, i) => ({ midi: 69, startSeconds: 0.5 * i, durationSeconds: 0.1, salience: 0.45 }));
  assert.deepEqual(melodyFromEvents(events, { acousticEvidence: signal }).notes, []);
});

test('pulse extraction abstains on irregular noise and static tone instead of inventing a default BPM', async () => {
  const tone = await analyzeAudioSignal(mix(10, [{ midi: 69 }]));
  assert.equal(tone.tempo, null);
  let seed = 127;
  const irregular = Float32Array.from({ length: 2000 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % 31 === 0 ? 1 : 0; });
  assert.equal(estimatePulse(irregular, 100), null);
});

test('acoustic evidence is optional, time-local, bounded, and unavailable outside its supported range', async () => {
  const signal = await analyzeAudioSignal(mix(2, [{ midi: 69, duration: 0.6 }, { midi: 72, start: 1, duration: 0.6 }]));
  assert.ok(supportForEvent(signal, { midi: 69, startSeconds: 0.1, durationSeconds: 0.3 }) > 0.9);
  assert.ok(supportForEvent(signal, { midi: 69, startSeconds: 1.1, durationSeconds: 0.3 }) < 0.1);
  assert.equal(supportForEvent(null, {}), null);
  assert.equal(supportForEvent(signal, { midi: 10, startSeconds: 0, durationSeconds: 1 }), null);
  assert.ok(signal.diagnostics.signalEvidenceBytes < 30000);
  await assert.rejects(analyzeAudioSignal(new Float32Array(10), { sampleRate: 44100 }), /22050/);
});
