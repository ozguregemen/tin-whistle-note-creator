"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeLiveNote } from "./live-note-display.mjs";
import { createPitchDetector, createPitchTracker, PITCH_WINDOW_SIZE } from "./live-pitch.mjs";
import { connectFollowInput, playReferenceNote, playReferenceSequence } from "./practice-reference.mjs";
import { createSongFollower, createWhistleReleaseDetector, emptyFollowProgress, FOLLOW_MIN_FREQUENCY, type FollowStep } from "./song-follow.mjs";
import { SongFollowPanel, songFollowCopy, type GuidePhase } from "./song-follow-panel";
import { Mascot, useMascotReaction } from "./mascot";

const COPY = {
  en: {
    title: "Live note recognition",
    idle: "Play one note at a time. Audio is processed in your browser.",
    start: "Start listening",
    stop: "Stop listening",
    cancel: "Cancel",
    requesting: "Waiting for microphone permission…",
    listening: "Listening",
    waiting: "Play a note",
    detected: "Detected note",
    notation: "Written for high D",
    fingering: "High D fingering",
    inferred: "From the detected note",
    mouthpiece: "From the mouthpiece down",
    noFingeringYet: "Play a note to see which holes to cover.",
    outOfRange: "This note is outside the high D fingering chart.",
    closed: "Closed",
    half: "Half-open",
    open: "Open",
    unsupported: "Microphone access is unavailable here. Try opening the site in a browser tab.",
    denied: "Allow microphone access in your browser and try again.",
    missing: "Connect a microphone and try again.",
    failed: "The microphone could not start. Check the device and try again.",
    ended: "Microphone disconnected. Reconnect it to keep listening.",
    lessonTitle: "Play the lesson",
    lessonStart: "Start microphone",
    listenExample: "Listen to example",
    stopExample: "Stop example",
    exampleError: "Example audio could not start. Try again.",
  },
  tr: {
    title: "Canlı nota tanıma",
    idle: "Tek tek nota çal. Ses tarayıcında işlenir.",
    start: "Dinlemeyi başlat",
    stop: "Dinlemeyi durdur",
    cancel: "İptal",
    requesting: "Mikrofon izni bekleniyor…",
    listening: "Dinleniyor",
    waiting: "Bir nota çal",
    detected: "Algılanan nota",
    notation: "Yüksek Re yazımı",
    fingering: "Yüksek Re parmak dizilimi",
    inferred: "Duyulan notaya göre",
    mouthpiece: "Ağızlıktan aşağı doğru",
    noFingeringYet: "Hangi delikleri kapatacağını görmek için bir nota çal.",
    outOfRange: "Bu ses yüksek Re tin whistle tablosunun dışında.",
    closed: "Kapalı",
    half: "Yarım açık",
    open: "Açık",
    unsupported: "Burada mikrofona erişilemiyor. Siteyi bir tarayıcı sekmesinde açmayı dene.",
    denied: "Tarayıcıdan mikrofon izni verip tekrar dene.",
    missing: "Bir mikrofon bağlayıp tekrar dene.",
    failed: "Mikrofon başlatılamadı. Cihazını kontrol edip tekrar dene.",
    ended: "Mikrofon bağlantısı kesildi. Dinlemeye devam etmek için tekrar bağla.",
    lessonTitle: "Dersi çal",
    lessonStart: "Mikrofonu başlat",
    listenExample: "Örneği dinle",
    stopExample: "Örneği durdur",
    exampleError: "Örnek ses başlatılamadı. Tekrar dene.",
  },
};

type Pitch = NonNullable<ReturnType<ReturnType<typeof createPitchDetector>>>;
const HOLE_LEGEND = ["closed", "half", "open"] as const;
const EMPTY_HOLES = Array.from({ length: 6 }, () => "pending");
type State = "idle" | "requesting" | "listening" | "unsupported" | "denied" | "missing" | "failed" | "ended";
type Capture = {
  context: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  frame?: number;
  step?: FollowStep;
  cue?: ReturnType<typeof playReferenceNote>;
};
type Preview = { context: AudioContext; frame?: number };

function release(capture: Capture) {
  if (capture.frame !== undefined) cancelAnimationFrame(capture.frame);
  capture.stream?.getTracks().forEach(track => track.stop());
  capture.source?.disconnect();
  if (capture.context.state !== "closed") void capture.context.close().catch(() => {});
}

function microphoneError(error: unknown): State {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "denied";
    if (error.name === "NotFoundError") return "missing";
  }
  return "failed";
}

export function LiveNoteReadout({ note, language }: { note: Pitch | null; language: "en" | "tr" }) {
  const copy = COPY[language];
  const display = note ? describeLiveNote(note, language) : null;
  const hasFingering = Boolean(display?.holes);
  const holes = display?.holes ?? EMPTY_HOLES;
  return (
    <div className="practice-microphone-readout">
      <div className="practice-microphone-pitch">
        <span className="practice-microphone-label">{copy.detected}</span>
        <div className="practice-microphone-note" aria-live="polite" aria-atomic="true">
          {display ? <><strong>{display.sounding}</strong><span>{display.name}</span></> : <span className="idle-note">{copy.waiting}</span>}
        </div>
        {note && <p>{Math.round(note.frequency)} Hz{display?.written && <span> · {copy.notation} {display.written}</span>}</p>}
      </div>
      <div className="practice-microphone-fingering">
        <div>
          <h3>{copy.fingering}</h3>
          <p>{copy.inferred}</p>
        </div>
        <div className="practice-microphone-holes">
          <div className="practice-microphone-whistle"
            role={hasFingering ? "img" : undefined}
            aria-label={display?.holes ? [copy.mouthpiece, ...display.holes.map(state => copy[state])].join(", ") : undefined}
            aria-hidden={!hasFingering || undefined}>
            {holes.map((state, index) => <span className={`hole ${state}`} aria-hidden="true" key={index} />)}
          </div>
          {display?.holes ? (
            <ul className="practice-microphone-counts">
              {HOLE_LEGEND.map(state => (
                <li key={state}><span className={`hole ${state}`} aria-hidden="true" /><strong>{display.counts[state]}</strong> {copy[state]}</li>
              ))}
            </ul>
          ) : <p>{display ? copy.outOfRange : copy.noFingeringYet}</p>}
        </div>
      </div>
    </div>
  );
}

export function PracticeMicrophone({ language, visible, onUseChange, steps, onChooseSong, lesson, onBeforeFollow }: {
  language: "en" | "tr";
  visible: boolean;
  onUseChange: (active: boolean) => void;
  steps: FollowStep[];
  onChooseSong?: () => void;
  lesson?: { onComplete: () => void };
  /** Called before a song is followed from the start; false keeps the microphone off (free daily limit). */
  onBeforeFollow?: () => boolean;
}) {
  const copy = COPY[language];
  const follow = songFollowCopy[language];
  const captureRef = useRef<Capture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  // Parents may pass a new callback on every render. Keep the latest one in a
  // ref so a re-render never runs the cleanup that releases an open microphone.
  const onUseChangeRef = useRef(onUseChange);
  const guideEnabledRef = useRef(false);
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState<Pitch | null>(null);
  const [mode, setMode] = useState<"song" | "free">(steps.length ? "song" : "free");
  const [progress, setProgress] = useState(emptyFollowProgress);
  const [guideEnabled, setGuideEnabled] = useState(false);
  const [guidePhase, setGuidePhase] = useState<GuidePhase>("idle");
  const [example, setExample] = useState<"idle" | "unavailable" | number>("idle");
  const exampleIndex = typeof example === "number" ? example : null;
  const active = state === "requesting" || state === "listening";
  const following = mode === "song" && steps.length > 0;
  const finished = following && progress.matched === steps.length;
  const nextStep = following ? steps[progress.matched] : undefined;
  const reaction = useMascotReaction(state === "listening" ? "focus" : "welcome");
  const mascotMood = finished ? "celebrate" : reaction.mood;

  const stopPreview = useCallback(() => {
    const preview = previewRef.current;
    previewRef.current = null;
    if (!preview) return;
    if (preview.frame !== undefined) cancelAnimationFrame(preview.frame);
    if (preview.context.state !== "closed") void preview.context.close().catch(() => {});
  }, []);

  useEffect(() => {
    onUseChangeRef.current = onUseChange;
  }, [onUseChange]);

  useEffect(() => {
    if (!visible) {
      // Keep the score position while releasing the microphone in the listening view.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("idle");
      setNote(null);
      setGuidePhase("idle");
      setExample("idle");
      return;
    }
    function releaseCapture() {
      stopPreview();
      const capture = captureRef.current;
      if (!capture) return;
      captureRef.current = null;
      release(capture);
      onUseChangeRef.current(false);
    }
    function pageHidden() {
      releaseCapture();
      setState("idle");
      setNote(null);
      setGuidePhase("idle");
      setExample("idle");
    }
    window.addEventListener("pagehide", pageHidden);
    return () => {
      window.removeEventListener("pagehide", pageHidden);
      releaseCapture();
    };
  }, [stopPreview, visible]);

  function stop(nextState: State = "idle") {
    stopPreview();
    setExample("idle");
    const capture = captureRef.current;
    if (capture) {
      captureRef.current = null;
      release(capture);
      onUseChangeRef.current(false);
    }
    setState(nextState);
    setNote(null);
    setGuidePhase("idle");
  }

  function resetPractice() {
    stop();
    setProgress(emptyFollowProgress());
  }

  function cueStep(capture: Capture, step: FollowStep) {
    try {
      if (capture.context.state !== "running") {
        setGuidePhase("unavailable");
        return;
      }
      capture.cue?.stop();
      capture.cue = playReferenceNote(capture.context, step);
      setGuidePhase("playing");
    } catch {
      setGuidePhase("unavailable");
    }
  }

  async function hearNextNote() {
    const capture = captureRef.current;
    if (capture) {
      if (state !== "listening") return;
      try {
        if (capture.context.state !== "running") await capture.context.resume();
        if (captureRef.current === capture && guideEnabledRef.current && capture.step) cueStep(capture, capture.step);
      } catch {
        if (captureRef.current === capture && guideEnabledRef.current) setGuidePhase("unavailable");
      }
      return;
    }
    if (!nextStep) return;
    stopPreview();
    setExample("idle");
    let preview: Preview | undefined;
    try {
      const reference = { context: new AudioContext() };
      preview = reference;
      previewRef.current = reference;
      setGuidePhase("playing");
      await reference.context.resume();
      if (previewRef.current !== reference) return;
      playReferenceNote(reference.context, nextStep, () => {
        if (previewRef.current !== reference) return;
        stopPreview();
        setGuidePhase("idle");
      });
    } catch {
      if (preview && previewRef.current !== preview) return;
      stopPreview();
      setGuidePhase("unavailable");
    }
  }

  async function toggleExample() {
    if (active || !steps.length) return;
    stopPreview();
    if (exampleIndex !== null) {
      setExample("idle");
      return;
    }
    setGuidePhase("idle");
    let session: Preview | undefined;
    try {
      const preview: Preview = { context: new AudioContext() };
      session = preview;
      previewRef.current = preview;
      setExample(0);
      await preview.context.resume();
      if (previewRef.current !== preview) return;
      const startTimes = playReferenceSequence(preview.context, steps, () => {
        if (previewRef.current !== preview) return;
        stopPreview();
        setExample("idle");
      });
      let index = 0;
      function followExample() {
        if (previewRef.current !== preview) return;
        const time = preview.context.currentTime;
        let next = index;
        while (next + 1 < startTimes.length && startTimes[next + 1] <= time) next += 1;
        if (next !== index) {
          index = next;
          setExample(index);
        }
        if (index + 1 < startTimes.length) preview.frame = requestAnimationFrame(followExample);
      }
      if (startTimes.length > 1) preview.frame = requestAnimationFrame(followExample);
    } catch {
      if (session && previewRef.current !== session) return;
      stopPreview();
      setExample("unavailable");
    }
  }

  function changeGuide(enabled: boolean) {
    guideEnabledRef.current = enabled;
    setGuideEnabled(enabled);
    if (enabled) {
      void hearNextNote();
    } else {
      stopPreview();
      setExample("idle");
      captureRef.current?.cue?.stop();
      setGuidePhase("idle");
    }
  }

  async function start() {
    if (captureRef.current) return;
    if (following && !lesson && (finished || !progress.matched) && onBeforeFollow && !onBeforeFollow()) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setState("unsupported");
      return;
    }
    stopPreview();
    setGuidePhase("idle");
    setExample("idle");
    let capture: Capture;
    try {
      capture = { context: new AudioContext() };
    } catch {
      setState("failed");
      return;
    }
    captureRef.current = capture;
    const initialProgress = finished ? emptyFollowProgress() : progress;
    const follower = following ? createSongFollower(steps, initialProgress) : null;
    if (follower) capture.step = steps[initialProgress.matched];
    if (finished) setProgress(initialProgress);
    onUseChangeRef.current(true);
    setState("requesting");
    try {
      const device = navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      }).then(stream => {
        if (captureRef.current === capture) capture.stream = stream;
        else stream.getTracks().forEach(track => track.stop());
        return stream;
      });
      const [stream] = await Promise.all([device, capture.context.resume()]);
      if (captureRef.current !== capture) return;
      if (!stream.active) { stop("ended"); return; }
      const analyser = capture.context.createAnalyser();
      analyser.fftSize = PITCH_WINDOW_SIZE;
      capture.source = capture.context.createMediaStreamSource(stream);
      // An analyser can read the input without routing it to the speakers.
      if (follower) connectFollowInput(capture.context, capture.source, analyser);
      else capture.source.connect(analyser);
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
        if (captureRef.current === capture) stop("ended");
      }, { once: true }));

      const samples = new Float32Array(PITCH_WINDOW_SIZE);
      const detect = createPitchDetector(capture.context.sampleRate, follower ? FOLLOW_MIN_FREQUENCY : undefined);
      const detectRelease = createWhistleReleaseDetector(capture.context.sampleRate);
      const track = createPitchTracker();
      let lastUpdate = -Infinity;
      let lastNote: Pitch | null = null;
      function read(now: number) {
        if (captureRef.current !== capture) return;
        const cue = capture.cue;
        const audioTime = capture.context.currentTime;
        const timeMs = audioTime * 1000;
        if (cue) {
          if (audioTime < cue.listenAt) {
            capture.frame = requestAnimationFrame(read);
            return;
          }
          capture.cue = undefined;
          follower?.hear(null, timeMs);
          if (guideEnabledRef.current) setGuidePhase("ready");
        }
        let quiet = false;
        if (follower) {
          analyser.getFloatTimeDomainData(samples);
          const releaseReading = detectRelease(samples, timeMs);
          quiet = releaseReading.quiet;
          if (releaseReading.released) follower.release();
        }
        if (now - lastUpdate >= 32) {
          lastUpdate = now;
          if (!follower) analyser.getFloatTimeDomainData(samples);
          const detected = quiet ? null : detect(samples);
          if (follower) {
            const updated = follower.hear(detected?.midi ?? null, timeMs);
            if (updated) {
              setProgress(updated);
              if (updated.feedback) reaction.react(updated.feedback.correct ? "correct" : "oops");
              if (updated.matched === steps.length) {
                stop();
                lesson?.onComplete();
                return;
              }
              if (updated.feedback?.correct) {
                capture.step = steps[updated.matched];
                if (guideEnabledRef.current && capture.step) cueStep(capture, capture.step);
              }
            }
          } else {
            const next = track(detected);
            if (next?.midi !== lastNote?.midi || Math.round(next?.frequency ?? 0) !== Math.round(lastNote?.frequency ?? 0)) {
              lastNote = next;
              setNote(next);
            }
          }
        }
        capture.frame = requestAnimationFrame(read);
      }
      setState("listening");
      if (guideEnabledRef.current && capture.step) cueStep(capture, capture.step);
      capture.frame = requestAnimationFrame(read);
    } catch (error) {
      if (captureRef.current === capture) stop(microphoneError(error));
    }
  }

  if (!visible) return null;

  const action = state === "requesting" ? copy.cancel
    : following ? state === "listening" ? follow.pause : finished ? follow.again : progress.matched ? follow.resume : lesson ? copy.lessonStart : follow.start
      : active ? copy.stop : copy.start;
  const description = state === "idle" && following ? follow.hint : copy[state];

  return (
    <section className="practice-microphone" aria-labelledby="practice-microphone-title">
      <div className="practice-microphone-header">
        <div className="practice-microphone-identity">
          <Mascot mood={mascotMood} size={72} />
          <div className="practice-microphone-copy">
            <h2 id="practice-microphone-title">{lesson ? copy.lessonTitle : following ? follow.title : copy.title}</h2>
            <p className={state === "listening" ? "microphone-live" : undefined} role="status">{description}</p>
            {lesson && example === "unavailable" && <p role="status">{copy.exampleError}</p>}
            {onChooseSong && !steps.length && <p>{follow.unavailable}</p>}
          </div>
        </div>
        <div className="practice-microphone-actions">
          {onChooseSong && <button type="button" className="secondary-action" onClick={() => { stop(); onChooseSong(); }}>{follow.choose}</button>}
          {lesson && <button type="button" className="secondary-action" disabled={active || !steps.length} onClick={() => void toggleExample()}>
            {exampleIndex !== null ? copy.stopExample : copy.listenExample}
          </button>}
          {!lesson && !!steps.length && <button type="button" className="secondary-action" onClick={() => {
            stop();
            setMode(following ? "free" : "song");
          }}>{following ? follow.free : follow.title}</button>}
          <button type="button" className={`secondary-action${active ? "" : " microphone-start"}`} onClick={() => active ? stop() : void start()}>
            {action}
          </button>
        </div>
      </div>
      {following
        ? <SongFollowPanel language={language} steps={steps} progress={progress} lesson={Boolean(lesson)} exampleIndex={exampleIndex}
          guideEnabled={guideEnabled} guidePhase={guidePhase} onGuideChange={changeGuide}
          onHearNote={() => void hearNextNote()} replayDisabled={state === "requesting"} onReset={resetPractice} />
        : state === "listening" && <LiveNoteReadout note={note} language={language} />}
    </section>
  );
}
