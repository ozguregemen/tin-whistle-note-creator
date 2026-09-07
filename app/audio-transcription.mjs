import { melodyFromEvents } from './melody-engine.mjs';
import { melodyToWhistlePractice } from './melody-whistle-adapter.mjs';
import { basicPitchEvidenceFromPcm, mixAudioChannels } from './basic-pitch-provider.mjs';
import { MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS } from '../shared/audio-limits.mjs';
import { analyzeAudioSignal } from './audio-signal.mjs';
export { audibleMidiToWrittenWhistleToken } from './melody-whistle-adapter.mjs';

// Compatibility boundary; primary engine output stays concert MIDI/seconds.
export function melodyFromTranscriptionEvents(events, options = {}) {
  return melodyToWhistlePractice(melodyFromEvents(events, {
    ...options,
    ...(options.minimumAmplitude == null ? {} : { minimumSalience: options.minimumAmplitude }),
    ...(options.minimumDurationSeconds == null ? {} : { minimumSeconds: options.minimumDurationSeconds }),
    ...(options.maxPhraseNotes == null ? {} : { maximumPhraseNotes: options.maxPhraseNotes }),
  }), options);
}

/** Replaceable audio-evidence boundary for a future source-separated backend. */
export async function transcribePcmToMelody(pcm, options = {}) {
  // A replacement provider can supply its own stronger evidence. Never force
  // browser DSP on an isolated/backend result unless explicitly requested.
  const analyze = options.signalAnalysis !== false && (!options.provider || options.signalAnalysis === true);
  const signal = analyze ? await analyzeAudioSignal(pcm, { ...options,
    onProgress: p => options.onProgress?.(p * 0.1) }) : null;
  const evidence = await (options.provider || basicPitchEvidenceFromPcm)(pcm, { ...options,
    onProgress: p => options.onProgress?.((analyze ? 0.1 : 0) + p * (analyze ? 0.9 : 1)) });
  const melody = melodyFromEvents(evidence.events, { ...options, acousticEvidence: signal });
  melody.estimatedTempo = evidence.estimatedTempo ?? signal?.tempo ?? null;
  melody.provider = evidence.provider;
  melody.diagnostics = { ...evidence.diagnostics, ...signal?.diagnostics, ...melody.diagnostics,
    acousticGuidance: !!signal };
  return options.captureEvidence ? { ...melody, evidence: evidence.events } : melody;
}

/** @param {(progress: number) => void} [onProgress] */
export async function transcribeAudioToMelody(file, onProgress = () => {}, options = {}) {
  if (!(file instanceof Blob)) throw new TypeError('An audio file is required');
  if (file.size > MAX_AUDIO_BYTES) throw new RangeError('Audio file must be 30 MB or smaller');
  const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser');
  const context = new AudioContextConstructor({ sampleRate: 22050 });
  const started = performance.now();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > MAX_AUDIO_DURATION_SECONDS) throw new RangeError('Audio must be 10 minutes or shorter');
    let buffer = decoded;
    if (decoded.sampleRate !== 22050) {
      const OfflineContext = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
      if (!OfflineContext) throw new Error('Audio resampling is not supported by this browser');
      const offline = new OfflineContext(decoded.numberOfChannels, Math.ceil(decoded.duration * 22050), 22050);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      buffer = await offline.startRendering();
    }
    const pcm = mixAudioChannels(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)));
    const decodeMs = performance.now() - started;
    const result = await transcribePcmToMelody(pcm, { ...options, sampleRate: 22050,
      modelUrl: options.modelUrl ?? new URL('models/basic-pitch/model.json', document.baseURI).href, onProgress });
    result.diagnostics.decodeMs = decodeMs;
    result.diagnostics.totalMs = performance.now() - started;
    onProgress(1);
    return result;
  } finally { await context.close(); }
}

/** @param {(progress: number) => void} [onProgress] */
export async function transcribeAudioFile(file, onProgress = () => {}, options = {}) {
  return melodyToWhistlePractice(await transcribeAudioToMelody(file, onProgress, options), options);
}
