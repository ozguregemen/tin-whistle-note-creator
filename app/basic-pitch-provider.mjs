/*
 * Copyright 2022 Spotify AB
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified: explicit tensor ownership, bounded evidence chunks and support
 * aggregation. Window conventions follow spotify/basic-pitch-ts 1.0.1.
 */
export const BASIC_PITCH_PARAMETERS = Object.freeze({
  sampleRate: 22050, windowSamples: 43844, overlapSamples: 7680, trimFrames: 15, framesPerSecond: 86,
  chunkSeconds: 12, contextSeconds: 1.2, onsetThreshold: 0.3, frameThreshold: 0.3, minimumNoteFrames: 3,
});
let runtimePromise;
let busy = false;
export async function loadBasicPitchRuntime(modelUrl, loadModel) {
  if (!runtimePromise) runtimePromise = (async () => {
    const [tf, decoder] = await Promise.all([import('@tensorflow/tfjs'), import('@spotify/basic-pitch')]);
    await tf.ready();
    const model = await tf.loadGraphModel(loadModel || modelUrl);
    return { tf, model, decoder };
  })().catch((e) => { runtimePromise = undefined; throw e; });
  return runtimePromise;
}
export async function disposeBasicPitchRuntime() {
  if (busy) throw new Error('Cannot dispose the model during transcription');
  const runtime = runtimePromise;
  runtimePromise = undefined;
  if (runtime) (await runtime).model.dispose();
}
export function mixAudioChannels(channels) {
  if (!channels.length || channels.some((c) => c.length !== channels[0].length)) throw new Error('Invalid audio channels');
  const mono = new Float32Array(channels[0].length);
  for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
  return mono;
}
// No async tidy scope or global engine scope. JS arrays alone escape the loop.
export async function inferBasicPitchWindow(pcm, runtime, onProgress = () => {}, signal) {
  const { tf, model } = runtime;
  const p = BASIC_PITCH_PARAMETERS;
  const input = tf.tidy(() => {
    const padded = tf.concat1d([tf.zeros([p.overlapSamples / 2]), tf.tensor1d(pcm)]);
    return tf.expandDims(tf.signal.frame(padded, p.windowSamples, p.windowSamples - p.overlapSamples, true, 0), -1);
  });
  const outputs = { frames: [], onsets: [], contours: [] };
  const total = Math.floor(pcm.length * p.framesPerSecond / p.sampleRate);
  try {
    for (let i = 0; i < input.shape[0] && outputs.frames.length < total; i++) {
      if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');
      const tensors = tf.tidy(() => {
        const predictions = model.execute(input.slice([i, 0, 0], [1, -1, -1]), ['Identity_1', 'Identity_2', 'Identity']);
        return predictions.map((tensor) => {
          const count = Math.min(tensor.shape[1] - p.trimFrames * 2, total - outputs.frames.length);
          return tensor.slice([0, p.trimFrames, 0], [1, count, -1]).reshape([count, tensor.shape[2]]);
        });
      });
      try {
        const arrays = await Promise.all(tensors.map((tensor) => tensor.array()));
        ['frames', 'onsets', 'contours'].forEach((key, index) => outputs[key].push(...arrays[index]));
      } finally { tensors.forEach((tensor) => tensor.dispose()); }
      onProgress(outputs.frames.length / Math.max(1, total));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return outputs;
  } finally { input.dispose(); }
}
export function basicPitchEvidence(output, decoder) {
  if (output.frames.length < 2) return [];
  const p = BASIC_PITCH_PARAMETERS;
  // Keep residual decoding for legato, but bound its repeated matrix scans to
  // a short chunk. Use library time conversion, not frame/86 (which drifts).
  const raw = decoder.outputToNotesPoly(output.frames, output.onsets, p.onsetThreshold, p.frameThreshold, p.minimumNoteFrames);
  const timed = decoder.noteFramesToTime(raw);
  return raw.map((event, index) => {
    const pitch = event.pitchMidi - 21;
    let onsetConfidence = 0;
    for (let f = Math.max(0, event.startFrame - 1); f <= Math.min(output.onsets.length - 1, event.startFrame + 1); f++) {
      onsetConfidence = Math.max(onsetConfidence, output.onsets[f][pitch] || 0);
    }
    let contour = 0, count = 0;
    for (let f = event.startFrame; f < event.startFrame + event.durationFrames; f++) {
      const row = output.contours[f];
      if (!row) continue;
      contour += Math.max(row[pitch * 3 - 1] || 0, row[pitch * 3] || 0, row[pitch * 3 + 1] || 0);
      count++;
    }
    return { ...timed[index], salience: event.amplitude, onsetConfidence, contourSupport: count ? contour / count : null };
  });
}
export async function basicPitchEvidenceFromPcm(pcm, options = {}) {
  if (busy) throw new Error('Another audio transcription is still running');
  if (!(pcm instanceof Float32Array) || !pcm.length) throw new Error('Empty mono audio');
  if (options.sampleRate !== undefined && options.sampleRate !== 22050) throw new Error('Evidence provider requires mono audio at 22050 Hz');
  busy = true;
  const started = performance.now();
  try {
    const runtime = options.runtime || await loadBasicPitchRuntime(options.modelUrl);
    const loadedAt = performance.now();
    const p = BASIC_PITCH_PARAMETERS;
    const coreSize = p.chunkSeconds * p.sampleRate, context = Math.round(p.contextSeconds * p.sampleRate);
    const events = [];
    let inferenceMs = 0, decodeMs = 0, peakEvidenceFrames = 0;
    const beforeTensors = runtime.tf.memory().numTensors;
    for (let start = 0; start < pcm.length; start += coreSize) {
      if (options.signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');
      const coreEnd = Math.min(pcm.length, start + coreSize);
      const from = Math.max(0, start - context), to = Math.min(pcm.length, coreEnd + context);
      const inferAt = performance.now();
      const output = await inferBasicPitchWindow(pcm.subarray(from, to), runtime,
        (progress) => options.onProgress?.((start + (coreEnd - start) * progress) / pcm.length), options.signal);
      inferenceMs += performance.now() - inferAt;
      peakEvidenceFrames = Math.max(peakEvidenceFrames, output.frames.length);
      const decodeAt = performance.now();
      for (const event of basicPitchEvidence(output, runtime.decoder)) {
        const originalStart = event.startTimeSeconds + from / p.sampleRate;
        const clippedStart = Math.max(start / p.sampleRate, originalStart);
        const clippedEnd = Math.min(coreEnd / p.sampleRate, originalStart + event.durationSeconds);
        if (clippedEnd <= clippedStart) continue;
        events.push({ ...event, startTimeSeconds: clippedStart, durationSeconds: clippedEnd - clippedStart,
          onsetConfidence: clippedStart - originalStart > 0.02 ? null : event.onsetConfidence });
      }
      decodeMs += performance.now() - decodeAt;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { events, provider: 'basic-pitch-1.0.1', diagnostics: {
      modelLoadMs: loadedAt - started, inferenceMs, eventDecodeMs: decodeMs,
      audioSeconds: pcm.length / p.sampleRate, decodedMonoBytes: pcm.byteLength, rawEventCount: events.length, peakEvidenceFrames,
      evidenceNumericBytesEstimate: peakEvidenceFrames * 440 * 8,
      backend: runtime.tf.getBackend(), tensorsBefore: beforeTensors, tensorsAfter: runtime.tf.memory().numTensors,
    } };
  } finally { busy = false; }
}
