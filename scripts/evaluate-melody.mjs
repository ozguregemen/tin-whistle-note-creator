// Local, opt-in evaluation; no audio or annotations are uploaded.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { melodyFromEvents, simplifyMelody } from '../app/melody-engine.mjs';
import { transcribePcmToMelody } from '../app/audio-transcription.mjs';
import { loadBasicPitchRuntime, disposeBasicPitchRuntime, mixAudioChannels } from '../app/basic-pitch-provider.mjs';
import { evaluateMelody, sequenceEditDistance, compareMelodyMotif } from '../app/melody-evaluation.mjs';
import { readPcmWav, renderMelodyWav } from './melody-wav.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const json = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'));

async function syntheticBenchmark() {
  const { extractionCases, cleanupCases, note } = await import('../tests/fixtures/melody-cases.mjs');
  const { melodyFromTranscriptionEvents: legacy } = await import('../tests/fixtures/legacy-audio-transcription.mjs');
  const legacyPitches = (events) => legacy(events).notes.match(/[A-G]#?-?\d+/g)?.map((token) => {
    const [, p, oct] = token.match(/^([A-G]#?)(-?\d+)$/);
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(p) + (Number(oct) + 2) * 12;
  }) || [];
  const hardCases = [{ name: 'KNOWN LIMIT: much stronger bass, weak lead', events: [72, 74, 76, 74].flatMap((p, i) => [note(p, i * 0.5, 0.45, 0.55), note(48, i * 0.5, 0.45, 0.98)]), expected: [72, 74, 76, 74] },
    { name: 'anchored competing counter-melody', events: [72, 74, 76, 77, 79, 77].map((p, i) => note(p, i * 0.5, 0.45, 0.85))
      .concat([88, 87, 86, 85].map((p, i) => note(p, 1 + i * 0.5, 0.45, 0.83))), expected: [72, 74, 76, 77, 79, 77] }];
  const cases = [...extractionCases, ...hardCases].map((c) => {
    const oldPitches = legacyPitches(c.events), melody = melodyFromEvents(c.events), newPitches = melody.notes.map((n) => n.midi);
    return { name: c.name, expected: c.expected, oldPitches, newPitches,
      oldEditDistance: sequenceEditDistance(oldPitches, c.expected), newEditDistance: sequenceEditDistance(newPitches, c.expected), evidence: melody.confidence.level };
  });
  const cleanup = cleanupCases.map((c) => ({ name: c.name, expected: c.expected,
    oldPitches: legacyPitches(c.notes), newPitches: simplifyMelody(c.notes).notes.map((n) => n.midi) }));
  const events = Array.from({ length: 1500 }, (_, i) => Array.from({ length: 20 }, (_, p) => note(40 + p * 2, i * 0.2, 0.19, p === 18 ? 0.94 : 0.46))).flat();
  const memoryBefore = process.memoryUsage().heapUsed, start = performance.now();
  const melody = melodyFromEvents(events);
  return { type: 'constructed-event-regressions-not-audio-accuracy', cases, cleanup,
    stress: { audioSeconds: 300, inputEvents: events.length, outputNotes: melody.notes.length,
      milliseconds: performance.now() - start, heapDeltaBytes: process.memoryUsage().heapUsed - memoryBefore, diagnostics: melody.diagnostics,
      caveat: 'Node heap delta, not peak or mobile browser memory' } };
}

async function audioEvaluation(smoke = false) {
  let pcm, reference;
  if (smoke) {
    reference = { notes: [{ midi: 69, startSeconds: 0.2, durationSeconds: 0.6 }, { midi: 72, startSeconds: 1, durationSeconds: 0.6 }] };
    pcm = new Float32Array(22050 * 2);
    for (const n of reference.notes) {
      const from = Math.round(n.startSeconds * 22050), length = Math.round(n.durationSeconds * 22050);
      for (let i = 0; i < length; i++) {
        const envelope = Math.min(1, i / 220, (length - i) / 440);
        pcm[from + i] = 0.5 * envelope * Math.sin(2 * Math.PI * 440 * 2 ** ((n.midi - 69) / 12) * i / 22050);
      }
    }
  } else {
    const wav = readPcmWav(await readFile(resolve(value('--audio'))));
    if (wav.sampleRate !== 22050) throw new Error('For repeatable offline inference provide 22050 Hz WAV; see engineering/audio-melody.md');
    pcm = mixAudioChannels(wav.channels);
    reference = value('--reference') ? await json(value('--reference')) : null;
  }
  if (pcm.length > 22050 * 600) throw new RangeError('Maximum audio duration is 10 minutes');
  if (value('--reuse-evidence')) {
    const before = await json(value('--reuse-evidence'));
    const evidence = before.melody?.evidence ?? before.events;
    if (!Array.isArray(evidence)) throw new Error('Baseline must contain captured evidence');
    if (Math.abs((before.diagnostics?.audioSeconds ?? pcm.length / 22050) - pcm.length / 22050) > 0.05) {
      throw new Error('Baseline and audio duration differ; supply the exact same excerpt');
    }
    const melody = await transcribePcmToMelody(pcm, { captureEvidence: true,
      signalAnalysis: !args.includes('--no-signal'), provider: async () => ({ events: evidence,
        provider: before.melody?.provider || 'reused-evidence', diagnostics: { audioSeconds: pcm.length / 22050 } }) });
    return { type: 'reused-evidence-comparison', melody, diagnostics: melody.diagnostics,
      before: before.melody,
      evaluation: reference ? evaluateMelody(melody, reference, reference.interval || {}) : null,
      beforeEvaluation: reference && before.melody ? evaluateMelody(before.melody, reference, reference.interval || {}) : null,
      caveat: 'Same recording/timing required. Without annotations, different notes do not prove higher accuracy.' };
  }
  // Reuse installed TFJS CPU backend, not a new native dependency/model download.
  const tf = await import('@tensorflow/tfjs');
  const modelPath = resolve(root, 'node_modules/@spotify/basic-pitch/model');
  const manifest = JSON.parse(await readFile(resolve(modelPath, 'model.json'), 'utf8'));
  const weights = Buffer.concat(await Promise.all(manifest.weightsManifest.flatMap((group) => group.paths).map((path) => readFile(resolve(modelPath, path)))));
  const start = performance.now();
  const baseline = tf.memory();
  const runtime = await loadBasicPitchRuntime(null, tf.io.fromMemory({ modelTopology: manifest.modelTopology,
    weightSpecs: manifest.weightsManifest.flatMap((group) => group.weights), weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength) }));
  const modelLoadMs = performance.now() - start;
  try {
    let reported = -1;
    const melody = await transcribePcmToMelody(pcm, { runtime, captureEvidence: true, signalAnalysis: !args.includes('--no-signal'), onProgress: (p) => {
      const tenth = Math.floor(p * 10);
      if (tenth !== reported) { reported = tenth; process.stderr.write(`Inference ${Math.round(p * 100)}%\n`); }
    } });
    // Unannotated recordings are useful for diagnostics, never accuracy scores.
    const evaluation = reference ? evaluateMelody(melody, reference, reference.interval || {}) : null;
    const diagnostics = { ...melody.diagnostics, modelLoadMs, modelWeightBytes: weights.byteLength, totalMs: performance.now() - start };
    const repeat = smoke ? await transcribePcmToMelody(new Float32Array(22050), { runtime }) : null;
    await disposeBasicPitchRuntime();
    return { type: smoke ? 'generated-tones-and-silence-smoke-not-commercial-audio' : reference ? 'annotated-audio' : 'unannotated-audio-no-accuracy-claim', evaluation, melody, diagnostics,
      repeatedSilence: repeat && { notes: repeat.notes.length, diagnostics: repeat.diagnostics },
      memory: { before: baseline, afterDisposal: tf.memory() } };
  } finally { await disposeBasicPitchRuntime(); }
}

let report;
if (args.includes('--synthetic')) report = await syntheticBenchmark();
else if (args.includes('--smoke')) report = await audioEvaluation(true);
else if (value('--audio')) report = await audioEvaluation();
else if ((value('--events') || value('--prediction')) && value('--reference')) {
  const input = await json(value('--events') || value('--prediction'));
  const reference = await json(value('--reference'));
  const melody = value('--events') ? melodyFromEvents(input.events ?? input) : input;
  report = { melody, evaluation: evaluateMelody(melody, reference, reference.interval || {}) };
} else throw new Error('Use --synthetic | --smoke | --audio clip.wav [--reference truth.json] [--reuse-evidence baseline.json] [--no-signal] | --events evidence.json --reference truth.json | --prediction melody.json --reference truth.json [--out report.json] [--render listening.wav] [--motif untimed-pitches.json]');
if (value('--motif')) {
  const motif = await json(value('--motif'));
  if (!report.melody) throw new Error('--motif requires a melody result');
  report.motifComparison = compareMelodyMotif(report.melody, motif.pitches, motif.interval || {});
  if (report.before) report.beforeMotifComparison = compareMelodyMotif(report.before, motif.pitches, motif.interval || {});
}
if (value('--render')) {
  if (!report.melody?.notes) throw new Error('--render requires a melody result');
  const path = resolve(value('--render'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderMelodyWav(report.melody.notes));
  if (report.before?.notes) await writeFile(path.replace(/\.wav$/i, '') + '-before.wav', renderMelodyWav(report.before.notes));
}
if (value('--out')) {
  const path = resolve(value('--out'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`Saved ${path}\n`);
  // Keep large raw evidence off the terminal.
  process.stdout.write(JSON.stringify(report.evaluation || report.stress || report.diagnostics, null, 2) + '\n');
} else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
