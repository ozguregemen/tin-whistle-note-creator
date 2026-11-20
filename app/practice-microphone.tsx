"use client";

import { useEffect, useRef, useState } from "react";
import { describeLiveNote } from "./live-note-display.mjs";
import { createPitchDetector, createPitchTracker, PITCH_WINDOW_SIZE } from "./live-pitch.mjs";
import { connectFollowInput, playReferenceNote } from "./practice-reference.mjs";
import { createSongFollower, createWhistleReleaseDetector, emptyFollowProgress, FOLLOW_MIN_FREQUENCY, type FollowStep } from "./song-follow.mjs";
import { SongFollowPanel, songFollowCopy } from "./song-follow-panel";

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
};

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

export function PracticeMicrophone({ language, onStart, onUseChange, steps, onChooseSong }: {
  language: "en" | "tr";
  onStart: () => void;
  onUseChange: (active: boolean) => void;
  steps: FollowStep[];
  onChooseSong?: () => void;
}) {
  const copy = COPY[language];
  const follow = songFollowCopy[language];
  const captureRef = useRef<Capture | null>(null);
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState<Pitch | null>(null);
  const [mode, setMode] = useState<"song" | "free">(steps.length ? "song" : "free");
  const [progress, setProgress] = useState(emptyFollowProgress);
  const [referenceEnabled, setReferenceEnabled] = useState(false);
  const active = state === "requesting" || state === "listening";
  const following = mode === "song" && steps.length > 0;
  const finished = following && progress.matched === steps.length;
  const referenceStep = following ? steps[progress.matched] : undefined;

  useEffect(() => {
    const context = captureRef.current?.context;
    if (!referenceEnabled || state !== "listening" || !referenceStep || !context) return;
    return playReferenceNote(context, referenceStep.pitch, referenceStep.durationMs);
  }, [referenceEnabled, state, referenceStep]);

  useEffect(() => {
    function releaseCapture() {
      const capture = captureRef.current;
      if (!capture) return;
      captureRef.current = null;
      release(capture);
      onUseChange(false);
    }
    function pageHidden() {
      releaseCapture();
      setState("idle");
      setNote(null);
    }
    window.addEventListener("pagehide", pageHidden);
    return () => {
      window.removeEventListener("pagehide", pageHidden);
      releaseCapture();
    };
  }, [onUseChange]);

  function stop(nextState: State = "idle") {
    const capture = captureRef.current;
    if (capture) {
      captureRef.current = null;
      release(capture);
      onUseChange(false);
    }
    setState(nextState);
    setNote(null);
  }

  function resetPractice() {
    stop();
    setProgress(emptyFollowProgress());
  }

  async function start() {
    if (captureRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setState("unsupported");
      return;
    }
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
    if (finished) setProgress(initialProgress);
    onStart();
    onUseChange(true);
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
      let track = createPitchTracker();
      let lastUpdate = -Infinity;
      let lastNote: Pitch | null = null;
      let wasQuiet = false;
      function read(now: number) {
        if (captureRef.current !== capture) return;
        if (follower) {
          // A short energy window can detect a breath between repeated pitches
          // even when the longer window still holds the previous note.
          analyser.getFloatTimeDomainData(samples);
          const quiet = detectRelease(samples);
          if (quiet && !wasQuiet) {
            follower.release();
            track = createPitchTracker();
          }
          wasQuiet = quiet;
        }
        if (now - lastUpdate >= 32) {
          lastUpdate = now;
          if (!follower) analyser.getFloatTimeDomainData(samples);
          const next = !wasQuiet ? track(detect(samples)) : null;
          if (follower) {
            const updated = next ? follower.hear(next.midi) : null;
            if (updated) {
              setProgress(updated);
              if (updated.matched === steps.length) {
                stop();
                return;
              }
            }
          } else if (next?.midi !== lastNote?.midi || Math.round(next?.frequency ?? 0) !== Math.round(lastNote?.frequency ?? 0)) {
            lastNote = next;
            setNote(next);
          }
        }
        capture.frame = requestAnimationFrame(read);
      }
      setState("listening");
      capture.frame = requestAnimationFrame(read);
    } catch (error) {
      if (captureRef.current === capture) stop(microphoneError(error));
    }
  }

  const action = state === "requesting" ? copy.cancel
    : following ? state === "listening" ? follow.pause : finished ? follow.again : progress.matched ? follow.resume : follow.start
      : active ? copy.stop : copy.start;
  const description = state === "idle" && following ? follow.hint : copy[state];

  return (
    <section className="practice-microphone" aria-labelledby="practice-microphone-title">
      <div className="practice-microphone-header">
        <div className="practice-microphone-copy">
          <h2 id="practice-microphone-title">{following ? follow.title : copy.title}</h2>
          <p className={state === "listening" ? "microphone-live" : undefined} role="status">{description}</p>
          {onChooseSong && !steps.length && <p>{follow.unavailable}</p>}
        </div>
        <div className="practice-microphone-actions">
          {onChooseSong && <button type="button" className="secondary-action" onClick={() => { stop(); onChooseSong(); }}>{follow.choose}</button>}
          {!!steps.length && <button type="button" className="secondary-action" onClick={() => {
            stop();
            setMode(following ? "free" : "song");
          }}>{following ? follow.free : follow.title}</button>}
          <button type="button" className={`secondary-action${active ? "" : " microphone-start"}`} onClick={() => active ? stop() : void start()}>
            {action}
          </button>
        </div>
      </div>
      {following
        ? <SongFollowPanel language={language} steps={steps} progress={progress}
          referenceEnabled={referenceEnabled} onReferenceChange={setReferenceEnabled} onReset={resetPractice} />
        : state === "listening" && <LiveNoteReadout note={note} language={language} />}
    </section>
  );
}
