# Browser-local main melody engine

Initial engineering pass: 2026-09-06. This is a measured improvement to a heuristic
melody extractor, **not a claim of reliable transcription of commercial mixes**.
No commercial recording or human listening panel was supplied for that initial pass.
The subsequent user-supplied Nilüfer recording, acoustic guidance, pulse estimation,
and current measurements are documented in [the acoustic follow-up](audio-acoustic-pass.md).
The pipeline and measurements below are the historical event-engine baseline;
the follow-up describes what now runs by default in the browser.

## Audit: what the old pipeline actually did

`Blob -> AudioContext.decodeAudioData -> BasicPitch.evaluateModel -> all frame
and onset arrays -> outputToNotesPoly -> noteFramesToTime -> amplitude/duration
filter -> 75ms onset groups -> one DP-selected note per group -> same-pitch
merging -> phrases -> written whistle tokens`.

Concrete problems found in the implementation and installed Basic Pitch 1.0.1:

- The decoded buffer was passed directly to a runner requiring **mono 22050Hz**.
  Ordinary stereo recordings failed before selection. The new boundary mixes
  channels and explicitly resamples if the browser returns another sample rate.
- Every onset group forced a new selection. Chords could interrupt a sustained
  vocal; there was no candidate for continuing that vocal or choosing silence.
- Pitch-height reward biased the selection towards high accompaniment. Strong
  bass, backing vocals and counter-melodies were not actually understood.
- The 80ms filter and 75ms grouping discarded legitimate fast passages.
- Selected notes could overlap. Same-pitch merging erased intentional attacks.
- Phrase splitting erased the preceding rest, and an eight-beat cap shortened
  held notes/rests. The regression test now explicitly expects the real rest.
- Basic Pitch's `amplitude` is mean **frame activation**, not waveform loudness
  and not a calibrated probability of correct melody selection.
- Contour output was discarded, all evidence stayed in JS arrays for the full
  file, and the library runner retained tensors. Its residual note decoding also
  repeatedly scans matrices, becoming expensive on long full-file evidence.

Dense harmony, reverb, octave/harmonic confusions and continuous high instrumental
lines remain difficult because pitch detection does not identify the musical
role of a voice. Fixing selection alone cannot recover a vocal absent from the
model's evidence.

## Architecture and contract

```text
Audio file -> decode/resample/downmix -> replaceable pitch-evidence provider
 -> interval-lattice melody selection (including rest)
 -> conservative cleanup/simplification -> optional trusted-grid quantization
 -> neutral Melody in concert MIDI + seconds
 -> existing D-whistle notation adapter -> existing arrangement/practice UI
```

The engine does not import any fingering, whistle range, transposition or audio
playback code. `transcribeAudioToMelody` and `transcribePcmToMelody` are the neutral
entry points; `transcribeAudioFile` preserves the existing UI return contract.

```js
{
  schemaVersion: 1,
  pitchConvention: 'concert-midi',
  notes: [{ midi: 81, startSeconds: 0.2, durationSeconds: 0.6,
    salience: 0.8, onsetConfidence: 0.9, contourSupport: 0.7,
    confidence: { kind: 'uncalibrated-evidence', modelSupport: 0.8,
                  selectionMargin: 0.12 } }],
  phrases: [{ noteIndices: [0], startSeconds: 0.2, endSeconds: 0.8,
              reason: 'start' }],
  estimatedTempo: null,
  confidence: { kind: 'uncalibrated-evidence', level: 'medium',
                reviewRecommended: true },
  diagnostics: { /* counts, timings, ambiguity and cleanup edits */ }
}
```

Values above illustrate the schema, not measured probabilities. Notes are ordered
and nonoverlapping; timings remain absolute. Rests are the intervals between notes.
Phrase breaks use silence >=1.1s; twelve-note presentation breaks are labelled
`display-length`, not presented as detected musical cadences.

The adapter subtracts one octave **only at the written-whistle boundary**:
concert MIDI81 -> written A4, MIDI74 -> D4, MIDI83 -> B4. Existing physical whistle
playback, soundfont correction and fingering rules are unchanged. The adapter
normally removes only initial silence for practice and retains inter-phrase rests.
Its 90 BPM is a seconds-to-beats coordinate for playback, **not an estimated song
tempo**. Actual onset/duration ratios are retained, so an eight-second sound stays
eight seconds at that reference tempo. Changing practice BPM still changes speed.

A future provider receives mono PCM/options and returns `{events, provider,
diagnostics}`. Evidence may use neutral fields or Basic Pitch's event field names.
`captureEvidence: true` returns raw evidence for offline comparison. A backend can
replace this provider without adopting whistle notation; another instrument can
consume the neutral Melody independently.

## Predominant melody selection

`app/melody-engine.mjs` centralizes tunable parameters in `MELODY_PARAMETERS`.
The algorithm constructs intervals from event start/end boundaries, retains
currently sounding candidates, and runs a bounded Viterbi-style path including
an unvoiced/rest state. It never assumes highest note = melody.

- Emission: model support (80% note activation, 20% local contour support when
  available), minus an activity floor of .40. Below-floor evidence can lose to rest.
- Nearby attacks within 35ms provide **chord-density evidence only**, not onset
  merging. Weak dense attacks incur up to .22 penalty. Strong evidence is less
  penalized; chord membership is not treated as proof of accompaniment.
- A soft bass penalty (up to .24, tapering below MIDI55 and reduced for isolated
  notes) discourages accompaniment without excluding low melodies by range.
- Transition penalties favor continuity and held streams; they penalize large
  and octave switches, never automatically octave-fold notes. Strong attacks
  reduce transition cost; isolated strong attacks receive a larger reduction so
  legitimate 60ms return leaps are not cheaper to replace with silence.
- Same-pitch active evidence is deduplicated; a strong later attack supersedes
  an older tail so retriggers remain distinct.
- The candidate frontier is capped at sixteen pitches plus rest. The rest state
  remembers its winning recent pitch over short gaps. This is a bounded heuristic,
  **not** an exact unconstrained multivoice search: discarded voices can be lost.

The constants are engineering priors, not trained genre-independent weights.
No beat tracking, source identity, motif recognition or learned vocal detector
has been added. Repeated motifs are preserved when the selected notes support
them, not inferred from a dedicated repetition model.

## Deliberate cleanup and simplification

Selection and cleanup have separate entry points and test suites.

- Preserve strong repeated attacks; merge weak same-pitch fragments only within
  a 35ms seam. Aggregate model support by duration, not maximum confidence.
- Flatten a <=95ms weak excursion only when it returns to a stable same-note
  anchor, has no strong onset, is a small bend (<=2 semitones) or octave glitch,
  and neighboring stable durations sufficiently outweigh it.
- Reject tiny weak specks; retain tested strong 60ms chromatic passing tones and
  articulated octave leaps. Supported ornaments survive.
- A duration/support-weighted pitch-class histogram supplies a **soft set prior**.
  Relative major/minor are not falsely distinguished. Ambiguous sets abstain.
  An out-of-set weak excursion changes a cleanup threshold by only .03; there is
  no pitch snapping to a major/minor scale. Chromatic lines remain valid.
- Optional quantization requires explicit finite tempo confidence >=.8 **and a
  beat-grid offset**. Even then only <=15ms/10%-of-grid adjustments are allowed.
  Default audio transcription does not quantize or invent tempo from sparse onsets.

This does not completely remove strong/wide vocal vibrato or identify all grace
notes. Aggressive flattening would damage real chromatic lines and rhythmic hooks.

## Confidence semantics

Per-note support and local competing-candidate margins are retained. Overall
`high/medium/low` describes strength/ambiguity of model evidence, **not accuracy**.
The margin is a local emission margin, not a posterior probability or margin
between full Viterbi paths. Simplification cannot create new verified confidence.
All results retain `reviewRecommended: true`. EN/TR subtitles now describe the
evidence and explicitly ask for listening review, instead of implying a verified
melody. In particular, a dominant bass can be selected with strong evidence while
being the wrong perceptual melody. Calibration needs labelled real recordings.

## Model decision and alternatives

Basic Pitch remains a practical browser-local **pitch evidence provider**, not a
specialized main-melody recognizer. Its authors explicitly describe best results
with one instrument at a time. Both AMT quality **and** melody selection matter.
The existing Apache-2.0 model and TFJS dependency remain; no separation model,
native runtime or new framework is downloaded. Basic Pitch1.0.1 and existing
TFJS3.21.0 are pinned because the owned runner depends on exact window conventions.
[Basic Pitch](https://github.com/spotify/basic-pitch),
[TS inference](https://github.com/spotify/basic-pitch-ts/blob/main/src/inference.ts),
[event decoder](https://github.com/spotify/basic-pitch-ts/blob/main/src/toMidi.ts).

| Approach | Value | Practical boundary |
| --- | --- | --- |
| Current AMT + event/contour support | Small, local, multi-instrument pitch evidence | Not source identification; mixed vocals often imperfect |
| MELODIA/pitch salience contours | Continuous predominant pitch + voicing | Useful benchmark candidate; Essentia licensing/build implications require evaluation |
| pYIN / CREPE after isolation | Monophonic F0 and voiced/unvoiced contour, fewer chord candidates | No source identity on a full mix; separate stronger lead/vocal first |
| Source separation + F0 + same neutral Melody | Most promising substantial improvement for vocals | Backend/optional processing; not forced into static Pages/mobile bundle |

[MELODIA reference](https://essentia.upf.edu/reference/std_PredominantPitchMelodia.html),
[Essentia licensing](https://essentia.upf.edu/licensing_information.html),
[pYIN](https://librosa.org/doc/0.11.0/generated/librosa.pyin.html),
[CREPE](https://github.com/marl/crepe),
[torchcrepe](https://github.com/maxrmorrison/torchcrepe),
[Demucs](https://github.com/facebookresearch/demucs).

Essentia's AGPL/commercial licensing and separate model licences need review
before product integration. CREPE/torchcrepe and Demucs are MIT in their linked
repositories, but a concrete deployment must verify its selected weights and
dependencies too. Demucs reference GPU memory requirements are gigabytes; its
two-stem mode does not eliminate the full separation workload. This makes a
server-side optional pipeline more realistic than adding it to the current
static/browser bundle. F0 tracking alone is not a solution to voice selection.

## Reproducible evaluation workflow

```powershell
npm run eval:melody -- --synthetic --out outputs/melody-synthetic.json
npm run eval:melody -- --smoke --out outputs/melody-smoke.json
npm run eval:melody -- --audio clip.wav --reference truth.json --out outputs/clip-report.json
npm run eval:melody -- --events evidence.json --reference truth.json --out outputs/event-report.json
npm run eval:melody -- --prediction prediction.json --reference truth.json
```

The offline WAV reader accepts PCM16/24 and float32, mono/stereo at22050Hz. To
prepare a short evaluation excerpt from an audio file using an existing ffmpeg:

```powershell
ffmpeg -i song.mp3 -ss 30 -t 20 -ar 22050 -c:a pcm_s16le clip.wav
```

This CLI restriction ensures repeatable offline input without adding a decoder
dependency; the application still accepts its existing MP3/WAV/OGG/FLAC formats
through browser Web Audio. Annotations use **concert** MIDI and seconds relative
to the file being evaluated, not written whistle octaves:

```json
{
  "interval": { "startSeconds": 0, "endSeconds": 2 },
  "notes": [
    { "midi": 69, "startSeconds": 0.2, "durationSeconds": 0.6 },
    { "midi": 72, "startSeconds": 1.0, "durationSeconds": 0.6 }
  ]
}
```

Annotate a complete short interval including rests, not just a few chosen notes
from a whole song. `interval` excludes unannotated sections. `--audio` saves raw
model evidence and the neutral prediction with the metrics, so later selector
changes can be evaluated without rerunning the neural model. Model inference is
local, using installed weights; no uploaded audio, token or external service.
`--prediction` also permits comparing a future backend against identical truth.

Metrics: maximum one-to-one note precision/recall/F1 with 50ms onset and .5-semitone
pitch tolerances; pitch-class F1; mean matched-onset error; 10ms frame pitch/chroma
accuracy, voicing precision/recall and octave-error fraction; pitch edit distance
and direction-contour similarity. Frame metrics expose duration/rest errors that
note F1 alone misses. Empty denominators are `null`, not perfect accuracy.
Malformed/polyphonic truth is rejected; edit-distance work is bounded and reports
`null` for oversized pairs. These are simple documented metrics, not a claim of
full mir_eval/MIREX equivalence or subjective song recognizability.

For real evaluation: use 10–30s passages from several voices/genres plus solo
whistle, melody-low/bass-heavy, dense rock, backing vocals, an instrumental hook,
silence and repeated-note passages. Keep a held-out set when tuning weights.
Listen to source versus predicted contour, and track missing melody versus extra
accompaniment separately. Commercial recordings are deliberately not committed.

## Measurements and regression results

Measured locally on Windows/Node, TFJS CPU; no GPU/mobile/browser timing claim:

- Constructed extraction scenarios including a documented failure: exact pitch
  sequence agreement improved **9/15 -> 14/15**. This is a small hand-built
  regression set, not an unbiased test-set accuracy estimate.
- Separate seven cleanup scenarios: **5/7 -> 7/7** pitch-sequence agreement.
  Additional tests cover retriggers with tails, supported short return leaps,
  ordering, tonal abstention, quantization abstention and absolute phrase timing.
- New wins include melody below high accompaniment, held vocal over changing
  chords, 70ms passages, silence during accompaniment, anchored counter-melody,
  repeated articulation and short chromatic passing notes.
- Retained known failure: weak lead support .55 versus bass MIDI48 support .98.
  Both old and new choose bass. The new model-evidence label can be high: this
  demonstrates why it must not be labelled transcription correctness.
- Real model smoke on **two generated sine notes** in a two-second PCM signal:
  3 raw events -> 2 melody notes; note F1=1, frame raw pitch accuracy=.975,
  matched onset error≈7.9ms, no octave errors. One-second silence yielded0 notes.
  This validates wiring/timing on simple signals only, not real-song accuracy.
- Cold local model load≈60ms, two-second CPU inference≈8.88s, event decode≈19ms,
  selection/cleanup≈1.8ms. No network download included; CPU is slower than real
  time here, so a3–5minute song is **not guaranteed practical on every device**.
- Tensors:245 before/after inference,245 after another silence run,0 after model
  disposal. The previous runner retained28 tensors in an independent short probe.
  TFJS marks its byte accounting unreliable/upper-bound; counts are not total RSS.
- Five-minute dense synthetic evidence stress:30,000 events,20 concurrent pitches,
  processing≈113ms, heap delta≈21.9MB (not peak). This is postprocessing speed only.

Source size: installed model JSON174,537bytes + weights742,392bytes =916,929bytes.
The Pages build retains lazy neural loading: TFJS/model runtime chunk≈1,043kB
(261kB gzip), Basic Pitch decoder chunk≈37kB (11kB gzip). Evaluation CLI/fixtures
are not imported into the product. No additional model download was introduced.

## Memory, latency and deployment

Inference now owns/disposes temporary tensors in `tf.tidy`/`finally`, retains the
small cached model for repeated use, and yields between model windows. Decoding
operates on12s cores plus1.2s context on each side, then crops results into unique
core intervals. This bounds frame/onset/contour arrays to≈14.4s instead of the
whole song. Raw JS numeric payload at the largest chunk is≈4.36MB versus≈90.8MB
if all three evidence arrays were retained for five minutes (the old runner kept
only frames/onsets,≈36.3MB raw numeric payload). Array/object/TFJS overhead is additional. Boundary context adds
roughly20% steady-state inference work and can still change note segmentation.
Tests cover clipping and a sustained seam; real inference seams need listening.

The complete audio is still decoded in memory: five-minute mono22050 Float32 is
≈26.5MB; stereo buffers, the compressed file, decoder buffers and GPU allocations
are additional. This is not fully streaming audio.3–5minute mobile memory and
GPU runtime require device measurements. CPU fallback can be slow; prefer short
excerpts when evaluating. No heavier model or native Node backend was installed.

Complexity of extraction is O(N logN + T*(A logA + K²)), where T is the number of
start/end intervals, A active evidence, and K<=16. There is no all-event-pairs
melody DP. Residual Basic Pitch decoding remains scan-based but is bounded by
short inference chunks. UI still runs inference in the browser main thread;
yielding between windows is not equivalent to a Web Worker or fully responsive
GPU/CPU work during a window.

GitHub Pages model URL still resolves relative to `document.baseURI`. Model assets
and Apache licence are copied by both build paths. There is no required backend,
new private-site deployment, new service key or changed source Worker.

## Remaining failures and best next step

Weak vocals under strong bass/chords; high continuous accompaniment; near-equal
counter-melodies; heavily reverberant sustained voices; strong vibrato; bending
instruments; low/high harmonics mistaken for fundamentals; a melody absent from
pitch evidence; stereo phase cancellation when downmixing; phrase boundaries
without actual silence; authentic short ornaments versus noise; chunk seams.

Next meaningful research step: collect a small licensed/local, hand-annotated
listening set, then compare this browser baseline against **vocal/lead separation
followed by monophonic F0/voicing tracking**, through the same neutral contract.
Separation should be optional server-side (consent, file lifetime/privacy, job
progress/cancel), not silently added to static Pages. Vocals can be targeted by a
vocal stem; instrumental hooks may still require a lead-selection policy. This is
a stronger hypothesis to test, not a promised universal solution.

Unchanged: fingering rules, D-whistle range adaptation, transposition, soundfont
pitch correction, playback/metronome scheduling, search/source discovery, printing,
PDF, theme and layout. Only the audio-transcription boundary and its EN/TR review
wording changed in the app.

## Verification and changed-file map

Full suite (146 tests), production build, ESLint and GitHub Pages static build passed in this
pass. The standalone TypeScript check has only the existing missing Cloudflare
types (`cloudflare:workers`, `Fetcher`, `D1Database`) in unchanged backend files;
new transcription/UI type errors were fixed. The build still warns about the
large lazy TFJS chunk. npm reports existing dependency vulnerabilities; no broad
dependency upgrade or `audit fix --force` was performed in this scoped task.

- `app/audio-transcription.mjs`: decode/evidence/orchestration and compatibility.
- `app/basic-pitch-provider.mjs`: owned, chunked inference and onset/contour evidence.
- `app/melody-engine.mjs`: neutral selection, cleanup, confidence and phrases.
- `app/melody-whistle-adapter.mjs`: existing notation convention at the boundary.
- `app/melody-evaluation.mjs`: dependency-free reference metrics.
- `app/page.tsx`: EN/TR draft/review wording, no layout/player changes.
- `scripts/evaluate-melody.mjs`, `scripts/melody-wav.mjs`: local evaluation workflow.
- `scripts/copy-basic-pitch-model.mjs`: include model's Apache licence in builds.
- `package.json`, `package-lock.json`: evaluation command and pin already-used runtime versions.
- `tests/audio-transcription.test.mjs`: retained tests, corrected rest expectation,
  integration regression; new `melody-engine`, `melody-evaluation`, `basic-pitch-provider`,
  `melody-wav` tests and frozen baseline/scenario fixtures.
- `docs/`: regenerated tracked GitHub Pages static artifacts, not hand-edited.
- This document: audit, design, reproduction, measurements and limitations.

Generated local evaluation reports are in ignored `outputs/`; they contain
evidence/timing data and are not silently published with the site.
