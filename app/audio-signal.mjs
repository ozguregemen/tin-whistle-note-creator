/** Independent acoustic evidence, not a vocal separator or a correctness score.
 * Harmonic peak support cross-checks AMT notes; spectral novelty estimates pulse.
 * Original implementation; algorithm references/limitations: engineering/audio-melody.md.
 * One FFT scratch buffer; only compact pitch/novelty evidence survives each frame. */
export const SIGNAL_PARAMETERS = Object.freeze({
  fftSize: 4096, hopSamples: 441, minimumMidi: 36, maximumMidi: 96,
  harmonics: 5, harmonicDecay: 0.7, peakToleranceCents: 40,
  noiseFloor: 0.00003, yieldEveryFrames: 96,
  pulseSmoothingSeconds: 0.025, // absorb frame-grid jitter, not musical subdivisions
});
const clip = x => Math.min(1, Math.max(0, x));
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

function fftPlan(size) {
  const bits = Math.log2(size), reversed = new Uint32Array(size);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
  for (let i = 0; i < size; i++) {
    let x = i, r = 0;
    for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>>= 1; }
    reversed[i] = r;
  }
  return { reversed, window, real: new Float64Array(size), imag: new Float64Array(size) };
}
function spectrumAt(pcm, center, plan, magnitude) {
  const { real, imag, reversed, window } = plan, size = real.length;
  let power = 0;
  for (let i = 0; i < size; i++) {
    const sample = pcm[center + i - size / 2] || 0;
    real[reversed[i]] = sample * window[i]; imag[i] = 0; power += sample * sample;
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length, c = Math.cos(angle), s = Math.sin(angle);
    for (let from = 0; from < size; from += length) {
      let wr = 1, wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = from + j, b = a + length / 2;
        const tr = wr * real[b] - wi * imag[b], ti = wr * imag[b] + wi * real[b];
        real[b] = real[a] - tr; imag[b] = imag[a] - ti;
        real[a] += tr; imag[a] += ti;
        const next = wr * c - wi * s; wi = wr * s + wi * c; wr = next;
      }
    }
  }
  for (let k = 0; k < magnitude.length; k++) magnitude[k] = Math.hypot(real[k], imag[k]) / size;
  return Math.sqrt(power / size);
}

function harmonicSupport(magnitude, sampleRate, p, row) {
  const prefix = new Float64Array(magnitude.length + 1);
  let peak = 0;
  for (let k = 0; k < magnitude.length; k++) { prefix[k + 1] = prefix[k] + magnitude[k]; peak = Math.max(peak, magnitude[k]); }
  const peaks = [];
  for (let k = 2; k < magnitude.length - 1; k++) {
    if (magnitude[k] <= magnitude[k - 1] || magnitude[k] < magnitude[k + 1] || magnitude[k] < peak * 0.015) continue;
    // Log-magnitude interpolation avoids a low-frequency FFT bin rounding bias.
    const a = Math.log(magnitude[k - 1] + 1e-12), b = Math.log(magnitude[k] + 1e-12), c = Math.log(magnitude[k + 1] + 1e-12);
    const offset = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / (a - 2 * b + c || 1)));
    const radius = Math.max(5, Math.round(k * 0.08));
    const from = Math.max(0, k - radius), to = Math.min(magnitude.length, k + radius + 1);
    const floor = (prefix[to] - prefix[from]) / (to - from) + peak * 0.003;
    const prominence = Math.max(0, Math.log1p(magnitude[k] / floor) - 1);
    if (prominence > 0) peaks.push({ hz: (k + offset) * sampleRate / p.fftSize, prominence });
  }
  const insertionAt = hz => {
    // Binary search keeps work bounded even in noise with many spectral peaks.
    let a = 0, b = peaks.length;
    while (a < b) { const m = (a + b) >>> 1; if (peaks[m].hz < hz) a = m + 1; else b = m; }
    return a;
  };
  const atFrequency = hz => {
    const a = insertionAt(hz);
    let value = 0;
    for (const index of [a - 1, a]) {
      const q = peaks[index];
      if (q) value = Math.max(value, q.prominence * Math.max(0, 1 - Math.abs(1200 * Math.log2(q.hz / hz)) / p.peakToleranceCents));
    }
    return value;
  };
  let best = 0;
  for (let i = 0; i < row.length; i++) {
    const midi = p.minimumMidi + i;
    // A real note may be detuned/vibrating within its semitone bin. Anchor the
    // whole harmonic comb to the measured fundamental, not equal temperament.
    // Half-open bins give a spectral peak only one note identity; missing
    // fundamentals still cannot be manufactured from upper partials alone.
    const lower = frequency(midi - 0.5), upper = frequency(midi + 0.5);
    let anchor = null;
    for (let k = insertionAt(lower); k < peaks.length && peaks[k].hz < upper; k++) {
      if (!anchor || peaks[k].prominence > anchor.prominence) anchor = peaks[k];
    }
    if (!anchor) { row[i] = 0; continue; }
    const hz = anchor.hz, fundamental = anchor.prominence;
    let value = fundamental;
    for (let h = 2; h <= p.harmonics && hz * h < sampleRate / 2; h++) value += atFrequency(hz * h) / h ** p.harmonicDecay;
    // No invented subharmonic if only its upper partials exist. This is deliberately
    // conservative: missing-fundamental singing remains a documented failure.
    value *= Math.min(1, fundamental / 0.45);
    row[i] = value; best = Math.max(best, value);
  }
  if (best < 0.2) { row.fill(0); return; }
  for (let i = 0; i < row.length; i++) row[i] /= best;
}

/** Returns an uncalibrated pulse estimate. No downbeat/metrical-level claim and
 * deliberately no beat-grid offset suitable for quantization. */
export function estimatePulse(novelty, framesPerSecond) {
  if (!(framesPerSecond > 0) || novelty.length / framesPerSecond < 8) return null;
  const prefix = new Float64Array(novelty.length + 1);
  for (let i = 0; i < novelty.length; i++) prefix[i + 1] = prefix[i] + Math.max(0, novelty[i] || 0);
  const radius = Math.max(1, Math.round(framesPerSecond * 0.1));
  const attacks = Float64Array.from(novelty, (x, i) => {
    const a = Math.max(0, i - radius), b = Math.min(novelty.length, i + radius + 1);
    return Math.max(0, x - (prefix[b] - prefix[a]) / (b - a));
  });
  let power = 0, max = 0;
  for (const x of attacks) { power += x * x; max = Math.max(max, x); }
  if (power < 1e-12 || !max) return null;
  let peaks = 0;
  for (let i = 1; i < attacks.length - 1; i++) if (attacks[i] > max * 0.15 && attacks[i] > attacks[i - 1] && attacks[i] >= attacks[i + 1]) peaks++;
  if (peaks < 6) return null;
  // Without smoothing, rounded onsets at (e.g.) 16.67 frames line up perfectly
  // only every third pulse. At the real 50fps hop, 180 BPM then falsely wins at
  // 60 BPM. A short Gaussian tolerates that sampling jitter before correlation.
  const sigma = Math.max(0.5, framesPerSecond * SIGNAL_PARAMETERS.pulseSmoothingSeconds);
  const extent = Math.ceil(sigma * 3), kernel = Float64Array.from({ length: 2 * extent + 1 },
    (_, i) => Math.exp(-0.5 * ((i - extent) / sigma) ** 2));
  const total = kernel.reduce((s, x) => s + x, 0);
  const curve = Float64Array.from(attacks, (_, i) => {
    let sum = 0;
    for (let k = -extent; k <= extent; k++) sum += (attacks[i + k] || 0) * kernel[k + extent];
    return sum / total;
  });
  // Remove the positive DC floor: smoothing irregular attacks must not manufacture
  // apparent periodicity merely because their average activation is nonzero.
  const mean = curve.reduce((s, x) => s + x, 0) / curve.length;
  for (let i = 0; i < curve.length; i++) curve[i] -= mean;
  const maxLag = Math.ceil(framesPerSecond * 60 / 40) + 2;
  const correlation = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let product = 0, aPower = 0, bPower = 0;
    for (let i = lag; i < curve.length; i++) {
      product += curve[i] * curve[i - lag]; aPower += curve[i] ** 2; bPower += curve[i - lag] ** 2;
    }
    correlation[lag] = product / Math.sqrt(aPower * bPower || 1);
  }
  const candidates = [];
  // Compare distinct local peaks, not adjacent shoulders of the same peak.
  // Parabolic refinement also avoids integer-lag quantization at faster tempos.
  for (let lag = Math.max(2, Math.floor(framesPerSecond * 60 / 220)); lag < maxLag; lag++) {
    const a = correlation[lag - 1], b = correlation[lag], c = correlation[lag + 1];
    if (b <= a || b < c) continue;
    const offset = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / (a - 2 * b + c || 1)));
    const bpm = framesPerSecond * 60 / (lag + offset);
    if (bpm >= 39.5 && bpm <= 220.5) candidates.push({ bpm: Math.max(40, Math.min(220, bpm)),
      strength: b - 0.25 * (a - c) * offset });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.strength - a.strength);
  let best = candidates[0];
  // Prefer the shortest strongly supported pulse over integer multiples of it,
  // not an arbitrary 90/120 BPM prior. Half/double time is still disclosed.
  const strongest = best;
  for (const c of candidates) {
    const multiple = c.bpm / strongest.bpm;
    if (c.bpm > best.bpm && multiple >= 1.8 && Math.abs(multiple - Math.round(multiple)) < 0.05
      && c.strength >= strongest.strength * 0.92) best = c;
  }
  if (best.strength < 0.18) return null;
  const rival = candidates.find(c => {
    const ratio = Math.max(c.bpm / best.bpm, best.bpm / c.bpm);
    return Math.abs(ratio - Math.round(ratio)) > 0.05;
  });
  if (rival && rival.strength > best.strength * 0.96) return null;
  return { bpm: Math.round(best.bpm), kind: 'pulse-estimate', periodicity: best.strength,
    beatPhaseReliable: false, metricalLevelAmbiguous: true,
    alternatives: [best.bpm / 2, best.bpm * 2].filter(bpm => bpm >= 40 && bpm <= 220).map(Math.round) };
}

export async function analyzeAudioSignal(pcm, options = {}) {
  const p = { ...SIGNAL_PARAMETERS }, sampleRate = options.sampleRate ?? 22050;
  if (!(pcm instanceof Float32Array) || sampleRate !== 22050) throw new TypeError('Signal analysis requires 22050 Hz mono Float32 PCM');
  if (pcm.length > sampleRate * 600) throw new RangeError('Signal analysis is limited to 10 minutes');
  if (options.signal?.aborted) throw new DOMException('Audio analysis cancelled', 'AbortError');
  const started = performance.now(), count = Math.ceil(pcm.length / p.hopSamples);
  const width = p.maximumMidi - p.minimumMidi + 1;
  const pitches = new Float32Array(count * width), novelty = new Float32Array(count);
  const rms = new Float32Array(count), magnitude = new Float64Array(p.fftSize / 2 + 1);
  const previous = new Float64Array(magnitude.length), plan = fftPlan(p.fftSize);
  for (let f = 0; f < count; f++) {
    if (options.signal?.aborted) throw new DOMException('Audio analysis cancelled', 'AbortError');
    rms[f] = spectrumAt(pcm, f * p.hopSamples, plan, magnitude);
    if (rms[f] > p.noiseFloor) harmonicSupport(magnitude, sampleRate, p, pitches.subarray(f * width, (f + 1) * width));
    let flux = 0;
    for (let k = 2; k < magnitude.length; k++) {
      const value = Math.log1p(magnitude[k] * 1000);
      flux += Math.max(0, value - previous[k]); previous[k] = value;
    }
    novelty[f] = flux;
    if (f % p.yieldEveryFrames === 0) { options.onProgress?.(f / Math.max(1, count)); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  if (options.signal?.aborted) throw new DOMException('Audio analysis cancelled', 'AbortError');
  const framesPerSecond = sampleRate / p.hopSamples;
  options.onProgress?.(1);
  return { pitches, novelty, rms, minimumMidi: p.minimumMidi, width, framesPerSecond,
    tempo: estimatePulse(novelty, framesPerSecond),
    diagnostics: { signalAnalysisMs: performance.now() - started, signalFrames: count,
      signalEvidenceBytes: pitches.byteLength + novelty.byteLength + rms.byteLength } };
}

/** Time-weighted independent evidence. null means unavailable, NOT zero support.
 * Supplied model confidence is never overwritten by this relative spectral score. */
export function supportForEvent(signal, event) {
  if (!signal?.pitches) return null;
  const pitch = Math.round(event.midi ?? event.pitchMidi) - signal.minimumMidi;
  if (pitch < 0 || pitch >= signal.width) return null;
  const start = event.startSeconds ?? event.startTimeSeconds;
  const from = Math.max(0, Math.ceil(start * signal.framesPerSecond));
  const to = Math.min(signal.rms.length, Math.ceil((start + event.durationSeconds) * signal.framesPerSecond));
  let sum = 0, frames = 0;
  for (let f = from; f < to; f++) if (signal.rms[f] > SIGNAL_PARAMETERS.noiseFloor) {
    sum += signal.pitches[f * signal.width + pitch]; frames++;
  }
  return frames ? clip(sum / frames) : null;
}
