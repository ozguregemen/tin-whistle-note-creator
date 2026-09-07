# Acoustic guidance: real-recording follow-up

2026-09-06–07. A bounded improvement to the browser-local baseline, **not a solved
commercial-song transcription engine**. The user supplied the actual Nilüfer —
Caddelerde Rüzgar MP3 after the [initial event-engine pass](audio-melody.md).
Audio decoding, inference, evidence analysis and listening renders stayed local.
Neither the recording nor generated reports/renders are published or committed.

## Diagnosis

The earlier tests exercised event selection and simple generated tones, not this
mixed recording. Basic Pitch detected many simultaneous notes; the interval
selector repeatedly chose low accompaniment/harmonic candidates instead of a
recognizable lead. Its `amplitude` field is model activation, **not acoustic
loudness, vocal identity, or probability of a correct melody**. Continuity and
bass penalties alone cannot distinguish every musical source.

The full recording generated 8,055 candidate events. The previous neutral output
began with repeated concert MIDI47 (B2), before any whistle adaptation occurred.
This is evidence of a selection problem upstream of the whistle adapter, not
evidence of another soundfont/octave bug. The catalog arrangement is not an
aligned ground-truth transcription of this particular performance: different
keys, intros, excerpts and simplifications must not be forced to agree blindly.

Likewise, the previous 90 BPM value was a seconds-to-beats **reference**, not a
measured song tempo. Initial playback already preserved detected durations and
gaps at that reference tempo. Merely substituting a BPM without rescaling those
coordinates would change speed incorrectly; this pass explicitly avoids that.

## Current pipeline

```text
decode / mono 22050 Hz PCM
  -> compact harmonic-support evidence + spectral-onset novelty / pulse estimate
  -> existing chunked Basic Pitch polyphonic events
  -> interval selector using model + independent acoustic support, including rest
  -> existing conservative cleanup / phrase grouping
  -> instrument-independent concert MIDI + seconds, uncalibrated review status
  -> D-whistle adapter: seconds-to-beats at estimated or reference BPM
```

No extra model or package was installed. The acoustic pass verifies support for
**existing model candidates**; it cannot invent a missing vocal line. A replacement
provider still receives PCM and returns `{events, provider, diagnostics,
estimatedTempo?}`. Custom providers bypass this DSP by default, avoiding forced
reprocessing of a future isolated-vocal/F0 result. `signalAnalysis: true` opts in;
`signalAnalysis: false` reproduces the model-only path.

### Acoustic evidence

`app/audio-signal.mjs` implements its own radix-2 FFT with a 4096-sample Hann
window and 441-sample hop (50 frames/second). Log-magnitude peak interpolation
reduces low-frequency bin rounding error. Local spectral whitening reduces raw
loudness dominance; five harmonics, weighted by `1 / h^0.7`, supply relative
support over concert MIDI36–96. Each frame is normalized, not calibrated.

Important conservative choices:

- Peak tolerance is 40 cents; weak/noisy broad peaks lose prominence.
- Support requires some fundamental energy. This discourages invented
  subharmonics but can reject valid **missing-fundamental** singing.
- Out-of-range or unavailable acoustic evidence is `null`, not a zero score;
  those events keep the prior model-only behavior. The range is a DSP boundary,
  not a whistle range restriction or a ban on low/high melodies.
- Selection combines 55% model support and 45% acoustic support when available.
  The model remains the larger contributor; these are centralized, tunable
  engineering priors, **not learned or held-out calibrated weights**.
- Existing rest states, continuity/chord/bass penalties and conservative cleanup
  remain. Model support and acoustic support are recorded separately rather than
  calling acoustic salience a transcription-confidence probability.

Harmonic salience is an established approach, but this is a small original
implementation, not a port of a complete predominant-melody model. A harmonic
bass/guitar can still beat the vocal; a sine-like lead may be disadvantaged.
See the [AudioLabs harmonic-salience explanation](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C8/C8S2_SalienceRepresentation.html).

### Pulse, not full beat tracking

Positive log-spectrum differences provide onset novelty. Local-mean subtraction,
25 ms Gaussian smoothing, DC removal and normalized lag autocorrelation estimate
a repeated pulse across 40–220 BPM. Smoothing handles onset rounding at the real
50 fps hop: without it a 180 BPM impulse train aligned only every third pulse
and wrongly returned 60 BPM. Distinct correlation peaks with parabolic refinement
avoid confusing the shoulders of one peak with independent tempo candidates.
Only integer-related strong alternatives can replace the winning slower pulse.
Short/weak/ambiguous evidence abstains instead of defaulting to an alleged tempo.
There is no 90 or 120 BPM prior. The estimate explicitly carries
`metricalLevelAmbiguous: true` and half/double-time alternatives where applicable.
The [AudioLabs spectral-novelty reference](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C6/C6S1_NoveltySpectral.html)
explains the signal-processing family used here.

This is **not** a downbeat detector, beat-phase tracker, rhythm transcription or
variable-tempo map. There is deliberately no trusted `confidence`/`offsetSeconds`
pair to enable grid quantization. Detected note starts, lengths and rests retain
their measured seconds; an estimated BPM only changes their beat coordinates.
Therefore the initial playback duration does not change merely because the
reference is now 120 rather than 90. Metronome phase need not match the recording.

EN/TR player labels distinguish “pulse estimated from audio” from a fallback
reference tempo. Audio-derived songs are review-required drafts, not falsely
labelled personal manually entered notes or verified melodies. Search, score
tempos and BPM database behavior are otherwise unchanged.

## Measured local comparison

MP3: 44.1 kHz stereo, approximately 245.13 s. Decoded evaluation WAV: 22050 Hz mono,
245.087 s (normal MP3 padding difference). Windows/Node/installed TFJS CPU; **not
browser GPU or mobile measurements**. Baseline captured before enabling acoustic
guidance; after-selection reused the **same 8,055 raw events** and same PCM.

| Diagnostic | Model-only before | Acoustic-guided after |
| --- | ---: | ---: |
| Output notes | 254 | 326 |
| Selected voiced duration | 93.49 s | 135.04 s |
| Selected duration below concert MIDI55 | 18.30 s | 13.30 s |
| Adjacent note jumps of at least 12 semitones, including across rests | 44 | 27 |
| Low local selection-margin fraction | 0.588 | 0.462 |
| Pulse estimate | none (90 reference) | 119 BPM; 60 alternative |

These are **diagnostics, not accuracy metrics**. Fewer bass selections/jumps and
more voiced coverage might improve a lead, or still represent accompaniment.
More output notes are not inherently better. The first output now starts at
MIDI66, but there is no claim that it matches the vocal or the catalog's opening.
The 30–54 s excerpt changed from 22 to 39 notes, estimated 120 BPM, and stopped selecting MIDI47;
again this is a check on bass fixation, not validated melodic correctness.

No manually aligned ground truth or completed human A/B listening assessment is
available yet. Precision/recall/F1 for this MP3 are intentionally **not reported**.
It would be misleading to call the feature accurate because regressions pass.

### Cost

- Existing neural inference: about 346.5 s; baseline complete evaluation about
  348.9 s for the 245.1 s song on this CPU. Full-track CPU transcription remains slow.
- Added harmonic/pulse analysis: about 9.27 s; selection about 133 ms in the
  final full-recording run. Earlier local runs took approximately 3.75 s/65 ms;
  wall time varies with machine load. Neither is a mobile performance guarantee.
- Compact retained signal arrays: 3,088,260 bytes for this recording, approximately
  3.8 MB for five minutes and 7.6 MB at the existing ten-minute limit. These are
  **typed-array evidence bytes, not peak application memory**.
- FFT scratch data is reused; no full-song spectrogram is retained. Per-frame
  peak/prefix scratch allocations and JS/runtime overhead are additional.
- Decode buffers, PCM, model/tensors and Web Audio/GPU allocations still exist.
  This is not a streaming low-memory mobile solution. Analysis yields about every
  96 frames; existing neural windows can still block the main thread.
- Static bundle: main Pages JS about 295.6 kB (95.8 kB gzip); lazy TFJS chunk
  remains about 1,043.1 kB (261.5 kB gzip). Existing model weights/manifest total
  916,929 bytes; **no new model download or runtime dependency**.

## Reproducing and listening

Prepare the same recording or a clearly documented excerpt locally:

```powershell
ffmpeg -i song.mp3 -ar 22050 -ac 1 -c:a pcm_s16le clip.wav
npm run eval:melody -- --audio clip.wav --no-signal --out outputs/before.json
npm run eval:melody -- --audio clip.wav --reuse-evidence outputs/before.json --out outputs/after.json --render outputs/after.wav
```

The second command runs the model-only baseline. The third reruns selection with
acoustic evidence without rerunning the neural model. It writes `after.wav` and
`after-before.wav`: **neutral concert-pitch sine tones**, not the whistle sampler,
with original onsets/rests for listening against the source. Reuse requires the
exact same file/timing; the CLI checks duration but does not hash content.

Add `--reference truth.json` with the existing neutral concert-MIDI/seconds schema
to obtain before/after note and frame metrics over the annotated interval. An
unannotated report has `evaluation: null`. Original commercial audio and all
generated evaluation assets belong under ignored `outputs/`, never `public/` or
tracked `docs/`. CLI input stays WAV for repeatability; the browser still accepts
its existing MP3/WAV/OGG/FLAC formats.

Local files from this pass:

- `outputs/caddelerde-full-before.json`, `outputs/caddelerde-full-after.json`
- `outputs/caddelerde-before.json`, `outputs/caddelerde-after.json` (30–54 s)
- `outputs/caddelerde-after-before.wav`, `outputs/caddelerde-after.wav` (short A/B)
- `outputs/caddelerde-full-after-before.wav`, `outputs/caddelerde-full-after.wav`

## Tests and unchanged boundaries

Added tests cover harmonic vs octave/subharmonic evidence, model bass hallucination
vs a real low melody, a lower harmonic lead under a high sine, drums/noise,
fast chromatic notes and true register changes, local/missing evidence, silence,
cancellation (including final yield/empty PCM), pulse 40–220 at 50/100 fps
(including third/fourth-time alias regressions), tempo abstention, provider bypass, audio-draft
quality, unchanged second-based timing, and neutral WAV-render pitch/timing.
All prior selection, simplification, source, arrangement and playback tests remain.

Full `npm test` (including production build): **195/195 passed**. ESLint and
GitHub Pages static build passed. The real-model generated-tone smoke has note
F1=1 and frame pitch accuracy=1, about 7.9 ms matched-onset error, and no octave
errors; this validates wiring on two synthetic tones, **not commercial music**.
The existing large lazy neural-chunk build warning remains.

Standalone `npx tsc --noEmit` still reports the three existing backend type errors
in unchanged files: `cloudflare:workers` in `db/index.ts`, and `Fetcher` /
`D1Database` in `worker/index.ts`. No new audio/UI type errors were reported;
these unrelated backend declarations were not changed to mask the check.

Changed source: `audio-signal`, `audio-transcription`, `melody-engine`,
`melody-whistle-adapter`, `catalog-quality`, small EN/TR labels in `page.tsx`,
evaluation scripts/tests, these engineering notes, and generated Pages assets.
Untouched: note parsing, whistle fingerings/range, octave/pitch playback,
soundfont, metronome/loop scheduling, source discovery/ingestion, print/PDF,
layout/theme, Worker configuration and dependencies. No Worker deployment is
needed for this client-side pass. Nothing was pushed or privately deployed.

## What a materially stronger next engine requires

Basic Pitch is still useful browser-local polyphonic evidence, but its authors
state that it works best on a single instrument; it is not a trained lead-vocal
detector. [Official Basic Pitch repository](https://github.com/spotify/basic-pitch).

Benchmark **vocal F0 directly from the mix (RMVPE)** against **vocal separation
followed by monophonic F0**, using aligned short real passages and listening.
RMVPE specifically targets polyphonic vocal pitch; the official implementation
uses PyTorch and an Apache-2.0 code license. Verify the chosen weights/runtime,
memory, processing cost and licensing before integrating any deployment.
[RMVPE paper](https://arxiv.org/abs/2306.15412),
[official implementation](https://github.com/Dream-High/RMVPE).

That benchmark should measure missing vocals and leaked accompaniment separately,
not just change the selection weights on one song. A GPU/backend or optional
larger local engine can return the same neutral Melody/evidence contract; it
must not silently upload a user's file or force a heavy model into static Pages.
Instrumental hooks still need a lead-source policy rather than assuming vocals.

Not implemented here: source separation, vocal identity, automatic chorus/hook
selection, distinguishing an intro solo from the familiar sung section, learned
motif recognition, dependable beat/phrase structure, or a universal commercial
mix transcriber. The recording remains analyzed from its beginning; natural
rest/display phrase boundaries are not proof of verse/chorus understanding.
