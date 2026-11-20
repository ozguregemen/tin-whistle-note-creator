"use client";

import { useEffect, useRef, useState } from "react";
import { fingeringFor } from "./fingerings.mjs";
import { createPitchDetector, createPitchTracker, PITCH_WINDOW_SIZE } from "./live-pitch.mjs";

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
    notation: "Written for high D whistle",
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
    notation: "Yüksek Re tin whistle yazımı",
    unsupported: "Burada mikrofona erişilemiyor. Siteyi bir tarayıcı sekmesinde açmayı dene.",
    denied: "Tarayıcıdan mikrofon izni verip tekrar dene.",
    missing: "Bir mikrofon bağlayıp tekrar dene.",
    failed: "Mikrofon başlatılamadı. Cihazını kontrol edip tekrar dene.",
    ended: "Mikrofon bağlantısı kesildi. Dinlemeye devam etmek için tekrar bağla.",
  },
};

type Pitch = NonNullable<ReturnType<ReturnType<typeof createPitchDetector>>>;
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

export function PracticeMicrophone({ language, onStart, onUseChange }: {
  language: "en" | "tr";
  onStart: () => void;
  onUseChange: (active: boolean) => void;
}) {
  const copy = COPY[language];
  const captureRef = useRef<Capture | null>(null);
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState<Pitch | null>(null);
  const active = state === "requesting" || state === "listening";

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
      capture.source.connect(analyser);
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
        if (captureRef.current === capture) stop("ended");
      }, { once: true }));

      const samples = new Float32Array(PITCH_WINDOW_SIZE);
      const detect = createPitchDetector(capture.context.sampleRate);
      const track = createPitchTracker();
      let lastUpdate = -Infinity;
      let lastNote: Pitch | null = null;
      function read(now: number) {
        if (captureRef.current !== capture) return;
        if (now - lastUpdate >= 32) {
          lastUpdate = now;
          analyser.getFloatTimeDomainData(samples);
          const next = track(detect(samples));
          if (next?.midi !== lastNote?.midi || Math.round(next?.frequency ?? 0) !== Math.round(lastNote?.frequency ?? 0)) {
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

  const soundingNote = note ? `${note.pitch}${note.octave}`.replace("#", "♯") : "";
  const writtenNote = note && fingeringFor(note.pitch, note.octave - 1)
    ? `${note.pitch}${note.octave - 1}`.replace("#", "♯") : "";

  return (
    <section className="practice-microphone" aria-labelledby="practice-microphone-title">
      <div className="practice-microphone-copy">
        <h2 id="practice-microphone-title">{copy.title}</h2>
        <p role="status">{copy[state]}</p>
      </div>
      {state === "listening" && (
        <div className="practice-microphone-result">
          <div aria-live="polite" aria-atomic="true">
            {note && <span className="sr-only">{copy.detected} </span>}
            <strong>{soundingNote || copy.waiting}</strong>
          </div>
          {note && <small>{Math.round(note.frequency)} Hz{writtenNote && ` · ${copy.notation} ${writtenNote}`}</small>}
        </div>
      )}
      <button type="button" className="secondary-action" onClick={() => active ? stop() : void start()}>
        {state === "requesting" ? copy.cancel : active ? copy.stop : copy.start}
      </button>
    </section>
  );
}
