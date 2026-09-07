import { supportForEvent } from './audio-signal.mjs';
/** Instrument-independent concert-pitch melody engine. Scores are heuristics,
 * not probabilities of correctness. No whistle range/notation is used here. */
export const MELODY_PARAMETERS = Object.freeze({
  minimumSalience: 0.22,
  minimumSeconds: 0.04, // retain supported 60ms passages; reject sub-frame specks
  onsetWindowSeconds: 0.035, // chord evidence only; never collapse nearby onsets
  maximumCandidates: 16, // bounded Viterbi frontier (including dense mixes)
  activityFloor: 0.40, // silence competes with weak evidence
  chordPenalty: 0.22, // weak synchronous chord tones are not a new melody onset
  bassPenalty: 0.24, // soft below C3; solo bass is still permitted
  switchCost: 0.018,
  semitoneCost: 0.005,
  octaveSwitchCost: 0.04,
  articulatedTransitionFactor: 0.65,
  isolatedAttackTransitionFactor: 0.15, // preserve brief supported leaps without competing streams
  fragmentGapSeconds: 0.035,
  ornamentSeconds: 0.095,
  artifactSalience: 0.57,
  strongOnset: 0.72,
  phraseGapSeconds: 1.1,
  maximumPhraseNotes: 12,
  acousticWeight: 0.45, // independent harmonic evidence; never a correctness probability
});

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const end = (n) => n.startSeconds + n.durationSeconds;
const roundTime = (t) => Math.round(t * 1e6) / 1e6;

export function normalizeMelodyEvents(events, options = {}) {
  const p = { ...MELODY_PARAMETERS, ...options };
  return (Array.isArray(events) ? events : []).flatMap((event, id) => {
    const midi = Number(event?.midi ?? event?.pitchMidi);
    const startSeconds = Number(event?.startSeconds ?? event?.startTimeSeconds);
    const durationSeconds = Number(event?.durationSeconds);
    if (![midi, startSeconds, durationSeconds].every(Number.isFinite)
      || midi < 0 || midi > 127 || startSeconds < 0 || durationSeconds < p.minimumSeconds) return [];
    const rawSalience = event.salience ?? event.amplitude ?? (typeof event.confidence === 'number' ? event.confidence : event.confidence?.modelSupport);
    if (!Number.isFinite(rawSalience)) return [];
    const salience = clamp01(rawSalience);
    if (salience < p.minimumSalience) return [];
    return [{ ...event, id, midi: Math.round(midi), startSeconds, durationSeconds, salience,
      onsetConfidence: Number.isFinite(event.onsetConfidence) ? clamp01(event.onsetConfidence) : null,
      contourSupport: Number.isFinite(event.contourSupport) ? clamp01(event.contourSupport) : null,
      confidence: { ...(typeof event.confidence === 'object' ? event.confidence : {}), kind: 'uncalibrated-evidence', modelSupport: salience },
    }];
  }).sort((a, b) => a.startSeconds - b.startSeconds || b.salience - a.salience || a.midi - b.midi);
}

function annotateEvidence(events, p) {
  let left = 0;
  let right = 0;
  for (const e of events) {
    while (events[left]?.startSeconds < e.startSeconds - p.onsetWindowSeconds) left++;
    while (right < events.length && events[right].startSeconds <= e.startSeconds + p.onsetWindowSeconds) right++;
    const simultaneous = right - left;
    const chordness = Math.min(1, Math.max(0, simultaneous - 2) / 3);
    const modelSupport = e.contourSupport == null ? e.salience : e.salience * 0.8 + e.contourSupport * 0.2;
    const acoustic = supportForEvent(p.acousticEvidence, e);
    const support = acoustic == null ? modelSupport : modelSupport * (1 - p.acousticWeight) + acoustic * p.acousticWeight;
    e.acousticSupport = acoustic;
    // Reliable isolated lead evidence can survive simultaneous chord attacks.
    const weakSupport = Math.max(0, (0.86 - support) / 0.5);
    const bassness = Math.min(1, Math.max(0, (55 - e.midi) / 19));
    const bass = p.bassPenalty * bassness * (simultaneous > 1 ? 1 : 0.25);
    e.utility = support - p.activityFloor - p.chordPenalty * chordness * weakSupport - bass;
    e.simultaneous = simultaneous;
  }
}

/** Interval-lattice Viterbi: candidates include already sounding notes AND an
 * unvoiced state. A chord attack can no longer force a held melody to end.
 * Complexity O(N log N + T*(A log A + K²)), K<=16, A=active evidence events. */
export function extractPredominantMelody(rawEvents, options = {}) {
  const p = { ...MELODY_PARAMETERS, ...options };
  const events = normalizeMelodyEvents(rawEvents, p);
  annotateEvidence(events, p);
  if (!events.length) return { notes: [], diagnostics: { inputEvents: rawEvents?.length || 0, usableEvents: 0, ambiguity: 1, peakCandidates: 0 } };
  const boundaries = new Map();
  for (const e of events) {
    for (const [time, kind] of [[e.startSeconds, 'add'], [end(e), 'remove']]) {
      const t = roundTime(time);
      if (!boundaries.has(t)) boundaries.set(t, { add: [], remove: [] });
      boundaries.get(t)[kind].push(e);
    }
  }
  const times = [...boundaries.keys()].sort((a, b) => a - b);
  const active = new Map();
  const layers = [];
  let previousCandidates = [null];
  let previousScores = [0];
  let previousMemory = [null];
  let peakCandidates = 0;
  for (let i = 0; i < times.length - 1; i++) {
    const t = times[i];
    for (const e of boundaries.get(t).remove) active.delete(e.id);
    for (const e of boundaries.get(t).add) active.set(e.id, e);
    // Duplicate events for the same sounding pitch must not consume the beam.
    const byPitch = new Map();
    for (const e of active.values()) {
      const current = byPitch.get(e.midi);
      // A fresh articulated attack supersedes the same pitch's reverb/tail.
      const retrigger = current && e.startSeconds > current.startSeconds && e.onsetConfidence >= p.strongOnset;
      if (!current || retrigger || (current.onsetConfidence < p.strongOnset && current.utility < e.utility)) byPitch.set(e.midi, e);
    }
    const ranked = [...byPitch.values()].sort((a, b) => b.utility - a.utility || a.midi - b.midi);
    peakCandidates = Math.max(peakCandidates, ranked.length);
    const candidates = [null, ...ranked.slice(0, p.maximumCandidates)];
    const seconds = times[i + 1] - t;
    const scores = new Float64Array(candidates.length);
    const back = new Int16Array(candidates.length);
    const memory = [];
    for (let j = 0; j < candidates.length; j++) {
      const e = candidates[j];
      let best = -Infinity;
      for (let k = 0; k < previousCandidates.length; k++) {
        const prev = previousCandidates[k];
        let cost = 0;
        const anchor = prev || (previousMemory[k] && t - previousMemory[k].stop < p.phraseGapSeconds ? previousMemory[k] : null);
        if (anchor && e && anchor.midi !== e.midi) {
          const jump = Math.abs(anchor.midi - e.midi);
          // Onset evidence allows genuine articulated leaps; never octave-fold.
          const articulation = e.onsetConfidence >= p.strongOnset
            ? (ranked.length === 1 ? p.isolatedAttackTransitionFactor : p.articulatedTransitionFactor) : 1;
          cost = articulation * (p.switchCost + Math.min(24, jump) * p.semitoneCost
            + (jump >= 12 ? p.octaveSwitchCost : 0));
          if (prev && end(prev) > t + 0.03) cost += p.switchCost; // held stream persistence
        } else if (!!prev !== !!e) cost = p.switchCost * 0.4;
        const score = previousScores[k] - cost + (e ? e.utility : 0) * seconds;
        if (score > best) { best = score; back[j] = k; }
      }
      scores[j] = best;
      memory[j] = e ? { midi: e.midi, stop: end(e) } : previousMemory[back[j]];
    }
    layers.push({ start: t, stop: times[i + 1], candidates, back });
    previousCandidates = candidates;
    previousScores = scores;
    previousMemory = memory;
  }
  let index = 0;
  for (let i = 1; i < previousScores.length; i++) if (previousScores[i] > previousScores[index]) index = i;
  const slices = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const chosen = layer.candidates[index];
    if (chosen) {
      const rival = Math.max(0, ...layer.candidates.filter((e) => e && e.midi !== chosen.midi).map((e) => e.utility));
      slices.push({ e: chosen, start: layer.start, stop: layer.stop, margin: chosen.utility - rival });
    }
    index = layer.back[index];
  }
  slices.reverse();
  const notes = [];
  let ambiguousSeconds = 0;
  let voicedSeconds = 0;
  for (const slice of slices) {
    const { e, start, stop, margin } = slice;
    const previous = notes.at(-1);
    const duration = stop - start;
    voicedSeconds += duration;
    if (margin < 0.08) ambiguousSeconds += duration;
    if (previous?.eventId === e.id && Math.abs(end(previous) - start) < 0.00001) {
      previous.durationSeconds = roundTime(stop - previous.startSeconds);
      previous.confidence.selectionMargin = Math.min(previous.confidence.selectionMargin, margin);
    } else notes.push({ midi: e.midi, startSeconds: start, durationSeconds: roundTime(duration),
      salience: e.salience, onsetConfidence: Math.abs(start - e.startSeconds) < 0.02 ? e.onsetConfidence : null,
      contourSupport: e.contourSupport, eventId: e.id,
      confidence: { kind: 'uncalibrated-evidence', modelSupport: e.salience, acousticSupport: e.acousticSupport, selectionMargin: margin },
    });
  }
  return { notes, diagnostics: { inputEvents: rawEvents?.length || 0, usableEvents: events.length,
    timelineSlices: layers.length, peakCandidates, ambiguity: voicedSeconds ? ambiguousSeconds / voicedSeconds : 1,
    candidateLimit: p.maximumCandidates } };
}

/** Tonal fit is descriptive. A scale never rewrites a well-supported chromatic note. */
export function estimateTonalContext(notes) {
  const histogram = Array(12).fill(0);
  for (const n of notes) histogram[n.midi % 12] += n.durationSeconds * n.salience;
  const total = histogram.reduce((a, b) => a + b, 0);
  if (!total || histogram.filter((v) => v > total * 0.03).length < 5) return null;
  const candidates = [];
  for (const [mode, intervals] of [['major', [0, 2, 4, 5, 7, 9, 11]], ['minor', [0, 2, 3, 5, 7, 8, 10]]]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const pitchClasses = intervals.map((i) => (i + tonic) % 12);
      candidates.push({ tonic, mode, pitchClasses, fit: pitchClasses.reduce((s, pc) => s + histogram[pc], 0) / total });
    }
  }
  candidates.sort((a, b) => b.fit - a.fit);
  // Relative major/minor share a pitch-class set. We infer only that set,
  // never a tonic/mode from membership alone.
  const best = candidates[0];
  const alternative = candidates.find((c) => c.pitchClasses.some((pc) => !best.pitchClasses.includes(pc)));
  return { pitchClasses: best.pitchClasses, fit: best.fit, kind: 'pitch-class-set-fit',
    ambiguous: !alternative || best.fit - alternative.fit < 0.08 };
}

/** Cleanup has no source-selection authority. Only short weak excursions with
 * return-to-anchor context are flattened; supported passing notes survive. */
export function simplifyMelody(rawNotes, options = {}) {
  const p = { ...MELODY_PARAMETERS, ...options };
  const notes = normalizeMelodyEvents(rawNotes, { minimumSeconds: 0, minimumSalience: 0 });
  const tonalContext = estimateTonalContext(notes);
  const edits = { removedNoise: 0, flattenedExcursions: 0, mergedFragments: 0 };
  for (let i = 1; i < notes.length - 1; i++) {
    const a = notes[i - 1], n = notes[i], b = notes[i + 1];
    const difference = Math.abs(n.midi - a.midi);
    const close = n.startSeconds - end(a) <= p.fragmentGapSeconds && b.startSeconds - end(n) <= p.fragmentGapSeconds;
    const outsideScale = tonalContext && !tonalContext.ambiguous && !tonalContext.pitchClasses.includes(n.midi % 12);
    const softThreshold = p.artifactSalience + (outsideScale ? 0.03 : 0);
    if (options.simplification !== 'none' && a.midi === b.midi && close
      && (difference <= 2 || difference === 12) && n.durationSeconds <= p.ornamentSeconds
      && n.salience < softThreshold && !(n.onsetConfidence >= p.strongOnset)
      && a.durationSeconds + b.durationSeconds >= n.durationSeconds * 4) {
      n.midi = a.midi;
      n.onsetConfidence = null;
      edits.flattenedExcursions++;
    }
  }
  const cleaned = [];
  for (const n of notes) {
    if ((n.durationSeconds < p.minimumSeconds || n.salience < p.minimumSalience)
      && !(n.onsetConfidence >= p.strongOnset && n.salience >= 0.65)) { edits.removedNoise++; continue; }
    const previous = cleaned.at(-1);
    if (previous && previous.midi === n.midi && n.startSeconds <= end(previous) + p.fragmentGapSeconds
      && !(n.onsetConfidence >= p.strongOnset)) {
      const weight = previous.durationSeconds + n.durationSeconds;
      previous.salience = (previous.salience * previous.durationSeconds + n.salience * n.durationSeconds) / weight;
      previous.confidence = { ...previous.confidence, modelSupport: previous.salience,
        selectionMargin: Math.min(previous.confidence.selectionMargin ?? Infinity, n.confidence.selectionMargin ?? Infinity) };
      if (!Number.isFinite(previous.confidence.selectionMargin)) delete previous.confidence.selectionMargin;
      previous.durationSeconds = roundTime(Math.max(end(previous), end(n)) - previous.startSeconds);
      edits.mergedFragments++;
    } else {
      if (previous && end(previous) > n.startSeconds) previous.durationSeconds = roundTime(n.startSeconds - previous.startSeconds);
      cleaned.push({ ...n });
    }
  }
  return { notes: cleaned.filter((n) => n.durationSeconds > 0), tonalContext, edits };
}

export function phraseMelody(notes, options = {}) {
  const p = { ...MELODY_PARAMETERS, ...options };
  const phrases = [];
  for (let i = 0; i < notes.length; i++) {
    const current = phrases.at(-1);
    const gap = i ? notes[i].startSeconds - end(notes[i - 1]) : notes[i].startSeconds;
    if (!current || gap >= p.phraseGapSeconds || current.noteIndices.length >= p.maximumPhraseNotes) {
      phrases.push({ noteIndices: [i], startSeconds: notes[i].startSeconds, endSeconds: end(notes[i]),
        reason: i === 0 ? 'start' : gap >= p.phraseGapSeconds ? 'rest' : 'display-length' });
    } else { current.noteIndices.push(i); current.endSeconds = end(notes[i]); }
  }
  return phrases;
}

export function quantizeMelody(notes, tempo, options = {}) {
  // Melody onsets alone do not establish the beat. Only explicitly trusted
  // external tempo + grid phase permits a small (<=15ms) timing adjustment.
  if (!tempo || !Number.isFinite(tempo.confidence) || tempo.confidence < 0.8
    || !Number.isFinite(tempo.bpm) || !(tempo.bpm > 0) || !Number.isFinite(tempo.offsetSeconds)) return notes;
  const step = 60 / tempo.bpm / (options.subdivisions || 4);
  const snap = (time) => {
    const grid = tempo.offsetSeconds + Math.round((time - tempo.offsetSeconds) / step) * step;
    return Math.abs(grid - time) <= Math.min(0.015, step * 0.1) ? Math.max(0, grid) : time;
  };
  return notes.map((n, i) => {
    const startSeconds = snap(n.startSeconds);
    const stop = Math.min(snap(end(n)), i + 1 < notes.length ? snap(notes[i + 1].startSeconds) : Infinity);
    return stop > startSeconds ? { ...n, startSeconds, durationSeconds: stop - startSeconds } : n;
  });
}

export function melodyFromEvents(events, options = {}) {
  const start = performance.now();
  const selected = extractPredominantMelody(events, options);
  const selectedAt = performance.now();
  const simplified = simplifyMelody(selected.notes, options);
  const notes = options.quantize ? quantizeMelody(simplified.notes, options.tempo) : simplified.notes;
  const meanSupport = notes.length ? notes.reduce((s, n) => s + n.salience * n.durationSeconds, 0)
    / notes.reduce((s, n) => s + n.durationSeconds, 0) : 0;
  const ambiguity = selected.diagnostics.ambiguity;
  const level = !notes.length || meanSupport < 0.5 || ambiguity > 0.45 ? 'low'
    : meanSupport >= 0.8 && ambiguity < 0.1 ? 'high' : 'medium';
  return { schemaVersion: 1, pitchConvention: 'concert-midi', notes,
    phrases: phraseMelody(notes, options), estimatedTempo: null, // no unsupported BPM guess
    confidence: { kind: 'uncalibrated-evidence', level, meanModelSupport: meanSupport,
      ambiguousFraction: ambiguity, reviewRecommended: true },
    tonalContext: simplified.tonalContext,
    diagnostics: { ...selected.diagnostics, selectedNotes: selected.notes.length, outputNotes: notes.length,
      cleanup: simplified.edits, selectionMs: selectedAt - start, cleanupMs: performance.now() - selectedAt },
  };
}
