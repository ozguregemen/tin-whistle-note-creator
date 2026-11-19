"use client";

import { useId, useRef, useState } from "react";
import { DEFAULT_CLIP_SECONDS, formatClipTime } from "./audio-clip.mjs";

export type AudioClipRange = { start: number; end: number };

const COPY = {
  en: {
    title: "Choose a section",
    player: "Audio preview",
    start: "Start",
    end: "End",
    listen: "Play selected section",
    transcribe: "Transcribe selected section",
    length: "Selection length",
    previewError: "This audio could not be previewed. Try another file.",
    playError: "Playback could not start. Try the audio player above.",
  },
  tr: {
    title: "Bölüm seç",
    player: "Ses önizlemesi",
    start: "Başlangıç",
    end: "Bitiş",
    listen: "Seçili bölümü dinle",
    transcribe: "Seçili bölümü notaya çevir",
    length: "Seçim süresi",
    previewError: "Bu ses önizlenemedi. Başka bir dosya dene.",
    playError: "Ses oynatılamadı. Üstteki oynatıcıyı deneyebilirsin.",
  },
};

export function AudioClipPicker({ url, name, language, busy, onTranscribe }: {
  url: string;
  name: string;
  language: "en" | "tr";
  busy: boolean;
  onTranscribe: (range: AudioClipRange) => void;
}) {
  const t = COPY[language];
  const labelId = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const previewEnd = useRef<number | null>(null);
  const [selection, setSelection] = useState<(AudioClipRange & { duration: number }) | null>(null);
  const [error, setError] = useState<"previewError" | "playError" | null>(null);

  function loadDuration(duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) return;
    setSelection(current => current ?? { duration, start: 0, end: Math.min(DEFAULT_CLIP_SECONDS, duration) });
    setError(null);
  }

  function stopPreview() {
    previewEnd.current = null;
    audio.current?.pause();
  }

  function changeRange(edge: keyof AudioClipRange, value: number) {
    stopPreview();
    setError(null);
    setSelection(current => {
      if (!current) return current;
      const { duration } = current;
      const minimum = Math.min(0.1, duration);
      const oldLength = current.end - current.start;
      if (edge === "start") {
        const start = Math.max(0, Math.min(duration - minimum, value));
        const end = start <= current.end - minimum ? current.end : Math.min(duration, start + oldLength);
        return { duration, start, end };
      }
      const end = Math.min(duration, Math.max(minimum, value));
      const start = end >= current.start + minimum ? current.start : Math.max(0, end - oldLength);
      return { duration, start, end };
    });
  }

  function listen() {
    const player = audio.current;
    if (!player || !selection) return;
    setError(null);
    player.currentTime = selection.start;
    previewEnd.current = selection.end;
    void player.play().catch(() => {
      previewEnd.current = null;
      setError("playError");
    });
  }

  return (
    <section className="clip-picker" aria-labelledby={labelId}>
      <div className="clip-header">
        <h3 id={labelId}>{t.title}</h3>
        {selection && <span className="clip-length">{t.length} {formatClipTime(selection.end - selection.start)}</span>}
      </div>
      <p className="clip-name">{name}</p>
      <audio ref={audio} src={url} controls preload="metadata" aria-label={t.player}
        onLoadedMetadata={event => loadDuration(event.currentTarget.duration)}
        onDurationChange={event => loadDuration(event.currentTarget.duration)}
        onError={() => { setError("previewError"); setSelection(null); }}
        onPause={() => { previewEnd.current = null; }}
        onTimeUpdate={event => {
          const end = previewEnd.current;
          if (end !== null && event.currentTarget.currentTime >= end) {
            stopPreview();
            event.currentTarget.currentTime = end;
          }
        }} />
      {selection && (
        <>
          <div className="clip-controls">
            {(["start", "end"] as const).map(edge => (
              <label key={edge} className="clip-boundary">
                <span>{t[edge]} <strong aria-hidden="true">{formatClipTime(selection[edge])}</strong></span>
                <input type="range" min={0} max={Math.ceil(selection.duration * 10) / 10} step={0.1}
                  value={Math.round(selection[edge] * 10) / 10} aria-valuetext={formatClipTime(selection[edge])}
                  disabled={busy} onChange={event => changeRange(edge, event.currentTarget.valueAsNumber)} />
              </label>
            ))}
          </div>
          <div className="clip-actions">
            <button className="clip-listen" type="button" disabled={busy} onClick={listen}>{t.listen}</button>
            <button type="button" disabled={busy} onClick={() => { stopPreview(); onTranscribe(selection); }}>
              {t.transcribe}
            </button>
          </div>
        </>
      )}
      {error && <p className="clip-error" role="alert">{t[error]}</p>}
    </section>
  );
}
