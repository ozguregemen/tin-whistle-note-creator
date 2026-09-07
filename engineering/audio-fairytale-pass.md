# Fairytale: detuning support and an untimed motif diagnostic

2026-09-07. Follow-up to [acoustic guidance](audio-acoustic-pass.md), using the
user-supplied Fairytale MP3 and screenshot of a whistle arrangement. This is a
targeted physical-evidence correction, **not a solved main-melody extractor**.
No recording, reference-song fixture, or generated audio is shipped with the app.

## How the feature actually works

| Layer | Responsibility | Important limit |
| --- | --- | --- |
| Web Audio / `audio-transcription.mjs` | Decode a local file, mix stereo, resample to 22050 Hz PCM; coordinate stages | The recording is not automatically separated into instruments |
| `basic-pitch-provider.mjs` | Run the pinned Spotify Basic Pitch model via TensorFlow.js; decode pitch/onset/duration evidence in overlapping chunks | A pretrained polyphonic transcriber, not a recognizer of the song's lead voice |
| `audio-signal.mjs` | Measure harmonic support in the waveform and estimate a repeated pulse | Harmonic presence does not imply melodic importance; pulse is not a beat grid |
| `melody-engine.mjs` | Select one event stream with interval-based dynamic programming, rests, continuity and salience; clean fragments and segment phrases | These rules can choose accompaniment or switch between voices |
| Neutral Melody | Concert MIDI, start/duration seconds, evidence, uncertainty and phrases | Not an instrument-specific tab and not a verified score |
| `melody-whistle-adapter.mjs` and existing arrangement | Convert that melody into written D-whistle notation and practice timing | Cannot repair a wrong upstream melody |

Basic Pitch 1.0.1 and TensorFlow.js 3.21.0 remain installed. The model's frame
ordering, MIDI offset, contour indexing and inference-window trimming were checked
against the installed package; no general decode/octave convention error was found.
Its activation values are not acoustic loudness or calibrated melody accuracy.

**Uploading more files does not train this model.** There is no optimizer, weight
update, personalized learning or feedback-training loop. Local inference uses the
same frozen weights each time. More examples help development only when we compare
predictions against the intended melody and test changes on other recordings too.
No Spotify account/API call is used for transcription. No file was sent to an
external inference service in this pass.

## Why the provided comparisons are useful, but not literal ground truth

The supplied MP3 is 48 kHz stereo, approximately 86.7 seconds. Evaluation used the
whole recording decoded to 22050 Hz mono. The recognizable first reference motif
starts around 7.95 seconds, after an accompaniment introduction. The whistle
arrangement and recording also differ in key: the best match uses a **single +1
semitone transposition** of the reference. The reference's written whistle notes
were converted to concert MIDI before evaluation.

Comparing the first displayed note to the first reference note, or requiring all
absolute pitches to match without alignment, would therefore be misleading. The
recording is not hardcoded, recognized by name, replaced with known notes, trimmed
to a chorus, or transposed to the reference by the runtime engine.

The screenshot shows 84 notes; the local CPU baseline produced 89. We did not
establish bit-for-bit browser/backend/resampling equivalence. All numeric A/B
claims below use the same local PCM and the same captured Basic Pitch events.

## Concrete defect and correction

At approximately 14 seconds, the model already offered the intended Eb6/MIDI87
candidate with substantial activation. The waveform's fundamental was around
1260–1270 Hz, about 22–36 cents above the equal-tempered 1244.5 Hz. These are
fractions of a semitone, not an octave error.

Previously `harmonicSupport()` evaluated its harmonic comb at ideal equal-
tempered frequencies. Its 40-cent triangular tolerance weakened a slightly
detuned fundamental; the fundamental-strength gate then weakened it again. The
relative acoustic evidence for this candidate could drop to about 0.11 while
G4 accompaniment retained about 0.90. Tiny tuning/vibrato changes thus biased
selection away from an existing melody candidate.

The correction anchors the harmonic comb to the **measured spectral fundamental**
inside that MIDI note's half-open +/-50-cent bin. Neighboring notes do not own
the same peak. Upper harmonics are checked relative to the observed frequency,
using the existing tolerance and decay. Fundamental energy is still required.
No MIDI values are rewritten, no missing pitches are invented, and there is no
blanket octave shift, song lookup, melody-score weight change or new model.

This rule is neutral about whether a note is bass or lead: a genuinely detuned
bass receives the same correction. That is physically appropriate but can expose
the remaining weakness of the voice-selection algorithm.

## Measured comparison, including the counterexample

Baseline is commit `99deb48`, which **already includes acoustic guidance**, not
the much older model-only engine. The changed run reuses all 3,245 raw model
events so the comparison isolates acoustic support and its downstream selection.

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Whole-recording output notes | 89 | 90 |
| First-motif pitch edits (13-note reference, 7.8–16.4 s search interval) | 5 | 3 |
| Exact aligned motif pitches, allowing one fixed transposition | 9 | 11 |
| Best reference transposition | +1 semitone | +1 semitone |
| Pulse estimate | 167 BPM, 83 alternative | unchanged |

Two recovered candidates are Eb6/MIDI87 at 13.687–14.167 s and D6/MIDI86 at
14.325–14.569 s. Previously that region selected G4/MIDI67 accompaniment.
Repeated-note/ornament differences remain. The best matching excerpt can include
notes whose ends overlap the chosen interval boundary; it is not a timed score.

The diagnostic now breaks equal-edit alignments by greatest exact-match count,
both inside the dynamic program and at its endpoint. An independent review
caught an earlier arbitrary-tie undercount (8/10); the final consistent counts
are **9/11**. The pitch-edit improvement stays 5 to 3.

**These are not accuracy percentages.** Best-motif agreement allows excerpt
selection and a transposition search; it does not validate rhythm, voice identity,
the rest of the recording, or the simplified arrangement against the actual mix.
No manually timed ground truth or completed human A/B listening judgment is
available for these recordings. The 167 BPM pulse is not claimed to be the
correct musical beat level; this pass does not change tempo/rhythm estimation.

Countercheck on the previously supplied 245-second Nilüfer recording, also reusing
its identical 8,055 raw events:

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Output notes | 326 | 360 |
| Selected duration below concert MIDI55 | 13.30 s | 21.14 s |
| Adjacent jumps >=12 semitones, including across rests | 27 | 39 |

These increases are warning signals, **not evidence of general improvement**.
Without a lead annotation they also cannot prove that every extra low note is
wrong. The correction passes physical checks, but source identity, octave-stream
switching and accompaniment suppression need a broader real-recording benchmark.
Do not tune bass penalties on Fairytale alone to hide this result.

## Reusable evaluation workflow

Existing time-aligned `--reference` evaluation remains available for note F1,
onset error, frame pitch and octave metrics. New `--motif` supports a short
**untimed** reference in another key; it is independent of the runtime engine.
Example generic, non-song-specific local motif file:

```json
{"pitches":[60,64,67,64,60],"interval":{"startSeconds":5,"endSeconds":15}}
```

Use concert MIDI. Whistle written D4 corresponds to concert D5/MIDI74, for example.
Do not mix written whistle octaves with neutral audio pitches.

```powershell
ffmpeg -i recording.mp3 -ar 22050 -ac 1 -c:a pcm_s16le outputs/recording.wav
# Capture baseline on the baseline code revision, before changing the engine:
npm run eval:melody -- --audio outputs/recording.wav --out outputs/before.json
# On the changed revision, reuse identical model events and compare selection:
npm run eval:melody -- --audio outputs/recording.wav --reuse-evidence outputs/before.json --motif outputs/motif.json --out outputs/after.json --render outputs/after.wav
```

The report includes before/after motif comparisons and an explicit non-accuracy
caveat. References contain 4–64 notes; a bounded semi-global edit alignment tries
one fixed transposition per candidate. It preserves repeated notes and cannot
hide individual octave errors by folding each pitch separately. Work is capped
at 20 million DP cells across transpositions. It does not feed reference notes
back into transcription. Raw audio reuse currently checks duration, not content
hash: the developer must supply the exact same recording, not a same-length one.

Renders are neutral sine tones at concert pitch with detected onsets/rests,
**not the whistle sampler**. This makes pitch/selection comparison independent
of instrument adaptation. Local reports and full/short A/B WAVs are under ignored
`outputs/`; neither commercial recordings nor their generated transcriptions are
copied into `public/`, `docs/`, or committed test fixtures.

## Cost and verification

- Full 86.7-second CPU baseline: about 128.4 s model inference / 130.7 s total.
  This is Windows Node/TFJS CPU, not browser GPU or mobile performance.
- Acoustic analysis: 1.35 s before / 1.49 s after in recorded runs; selection
  approximately 26 / 43 ms and cleanup approximately 2 ms. Machine-load dependent.
- Retained acoustic arrays: 1,092,420 bytes, unchanged. Decoder PCM, model tensors,
  spectral scratch and JS/GPU overhead are additional; this is not peak memory.
- Model weights/manifest remain 916,929 bytes; no new model or dependency.
  Pages main JS approximately 295.80 kB (95.89 kB gzip); lazy neural chunk
  approximately 1,043.09 kB (261.46 kB gzip), with the existing size warning.
- Added physical tests: detuning at multiple registers and +/-45 cents,
  adjacent-semitone/harmonic discrimination, sustained vibrato, and absent
  fundamentals. The detuning regression was observed failing before the fix.
- Added motif tests: key/excerpt alignment, repeated notes, octave mistakes,
  equal-edit tie correctness, invalid input and bounded work.
- Existing arrangement, playback, parsing, source and timing tests remain.
  Final `npm test` (including production build): **201/201 passed**; ESLint,
  `npm run build:pages` and `git diff --check` passed. A real-model smoke on two
  generated tones returned note F1=1, no octave errors and about 7.9 ms mean
  onset error; that checks wiring on generated tones, not commercial-song quality.
- Standalone TypeScript still reports the existing missing `cloudflare:workers`,
  `Fetcher` and `D1Database` backend types in unchanged `db/index.ts` and
  `worker/index.ts`. They are not hidden or repaired as part of an audio change.

Changed production behavior is confined to `app/audio-signal.mjs` and regenerated
Pages assets. Other changed files are the evaluation utility/CLI, tests and this
report. Whistle adaptation/fingerings/register logic, pitch/soundfont, playback,
metronome/looping, search, sources, print/PDF, UI and Worker code are untouched.
No Worker deployment is needed. No private-site publication or Git push is part
of this pass.

## How the user can help; the next substantial improvement

Provide a recording and a timestamp where the wanted melody is clear, plus a
whistle example/tab when available. A short phone recording of the desired tune
is useful too: professional note/timing annotation is not required from the user.
Listen to original/old/new excerpts and identify whether the wrong voice was
chosen, pitches were wrong, or rhythm was wrong. Keep different songs/instrument
types as held-out checks rather than repeatedly tuning on one example.

The next experiment should compare **continuous predominant-pitch contours and
source/voice persistence**, not merely add more note filters. Evaluate isolated
lead/vocal F0 versus mixed-audio contours with timed 10–30 second references,
measuring missed lead notes and accompaniment leakage separately. Optional
separation/backend engines can implement the existing neutral provider contract;
they must not silently upload audio or force a large model into static Pages.

Basic Pitch is still useful small browser-local polyphonic evidence, but its
authors recommend one instrument at a time. A vocal-focused model such as RMVPE
is worth a separate experiment for singing; it is **not automatically a solution
for Fairytale's instrumental/orchestral lead**. Melody-contour methods such as
MELODIA are relevant research, not implementations added by this patch.

Primary references: [Basic Pitch](https://github.com/spotify/basic-pitch),
[Basic Pitch TypeScript](https://github.com/spotify/basic-pitch-ts),
[PredominantPitchMelodia](https://essentia.upf.edu/reference/std_PredominantPitchMelodia.html),
[RMVPE](https://github.com/Dream-High/RMVPE),
[user's whistle reference](https://www.tinwhistletab.com/tabs/fairytale_shrek_tab_and_backing_track).
