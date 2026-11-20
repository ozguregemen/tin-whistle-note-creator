"use client";

import { useEffect, useMemo, useRef } from "react";
import { pitchAndOctave } from "./fingerings.mjs";
import { describeLiveNote } from "./live-note-display.mjs";
import type { FollowProgress, FollowStep } from "./song-follow.mjs";

export const songFollowCopy = {
  en: {
    title: "Follow the song",
    free: "Free playing",
    choose: "Choose song",
    hint: "Play in order at your own pace. Each correct note moves you forward.",
    start: "Start following",
    pause: "Pause",
    resume: "Continue",
    again: "Play again",
    reset: "Restart",
    next: "Next note",
    nextFingering: "Suggested fingering, from the mouthpiece down",
    closed: "Closed",
    half: "Half-open",
    open: "Open",
    repeated: "Tongue this note again or take a short breath.",
    complete: "Song complete",
    completeDetail: "You matched every note.",
    correct: "Correct",
    wrong: "Try this step again",
    waiting: "Ready for a note",
    progress: "Notes matched",
    sequence: "Note sequence",
    pending: "Waiting",
    current: "Current step",
    reference: "Reference melody",
    referenceHint: "The guide follows your pace. Use headphones for a clearer microphone signal.",
    unavailable: "This song has no playable high D whistle sequence.",
  },
  tr: {
    title: "Şarkı takibi",
    free: "Serbest nota",
    choose: "Şarkı seç",
    hint: "Notaları kendi hızında sırayla çal. Doğru çaldıkça ilerle.",
    start: "Takibi başlat",
    pause: "Duraklat",
    resume: "Devam et",
    again: "Yeniden çal",
    reset: "Baştan başla",
    next: "Sıradaki nota",
    nextFingering: "Önerilen parmak dizilimi, ağızlıktan aşağı",
    closed: "Kapalı",
    half: "Yarım açık",
    open: "Açık",
    repeated: "Aynı notayı kısa bir aradan sonra yeniden üfle.",
    complete: "Şarkıyı tamamladın",
    completeDetail: "Bütün notaları doğru sırayla çaldın.",
    correct: "Doğru",
    wrong: "Bu adımı tekrar dene",
    waiting: "Nota bekleniyor",
    progress: "Eşleşen notalar",
    sequence: "Nota sırası",
    pending: "Bekliyor",
    current: "Sıradaki adım",
    reference: "Referans melodi",
    referenceHint: "Rehber ses senin hızında ilerler. Mikrofonun çalışını daha net duyması için kulaklık kullan.",
    unavailable: "Bu şarkı için çalınabilir bir yüksek Re nota dizisi bulunamadı.",
  },
};

export function SongFollowPanel({
  language, steps, progress, referenceEnabled, onReferenceChange, onReset,
}: {
  language: "en" | "tr";
  steps: FollowStep[];
  progress: FollowProgress;
  referenceEnabled: boolean;
  onReferenceChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const copy = songFollowCopy[language];
  const listRef = useRef<HTMLOListElement>(null);
  const labels = useMemo(() => steps.map(step => describeLiveNote(step, language)), [steps, language]);
  const target = labels[progress.matched];
  const finished = progress.matched === steps.length;
  const repeated = progress.matched > 0 && !finished && steps[progress.matched - 1].midi === steps[progress.matched].midi;
  const heard = progress.feedback ? describeLiveNote(pitchAndOctave(progress.feedback.midi), language) : null;
  const response = progress.feedback ? (progress.feedback.correct ? "correct" : "wrong") : "ready";

  useEffect(() => {
    const list = listRef.current;
    const note = list?.children[Math.min(progress.matched, steps.length - 1)];
    if (!list || !(note instanceof HTMLElement)) return;
    if (note.offsetTop < list.scrollTop) list.scrollTop = note.offsetTop;
    else if (note.offsetTop + note.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = note.offsetTop + note.offsetHeight - list.clientHeight + 4;
    }
  }, [progress.matched, steps.length]);

  return (
    <div className="song-follow">
      <div className="song-follow-dashboard">
        <div className="song-follow-target">
          <span className="song-follow-label">{finished ? copy.progress : copy.next}</span>
          {target ? (
            <>
              <div className="song-follow-target-note"><strong>{target.name}</strong><span>{target.sounding}</span></div>
              {!!target.holes && <div className="song-follow-target-holes" role="img"
                aria-label={[copy.nextFingering, ...target.holes.map(hole => copy[hole])].join(", ")}>
                {target.holes.map((hole, index) => <span className={`hole ${hole}`} key={index} aria-hidden="true" />)}
              </div>}
              {repeated && <p>{copy.repeated}</p>}
            </>
          ) : (
            <><div className="song-follow-target-note"><strong>{copy.complete}</strong></div><p>{copy.completeDetail}</p></>
          )}
        </div>
        <div className="song-follow-progress">
          <div className="song-follow-progress-heading">
            <span className="song-follow-label">{copy.progress}</span>
            <strong>{progress.matched} <span>/ {steps.length}</span></strong>
          </div>
          <progress max={steps.length} value={progress.matched} aria-label={copy.progress} />
          <div className={`song-follow-feedback ${response}`} role="status" aria-atomic="true">
            {heard && <span className="song-follow-feedback-note">{heard.name} <small>{heard.sounding}</small></span>}
            <span className="song-follow-feedback-status">{finished ? copy.complete : response === "ready" ? copy.waiting : copy[response]}</span>
          </div>
        </div>
      </div>

      <div className="song-follow-options">
        <div>
          <label className="song-follow-reference">
            <input type="checkbox" checked={referenceEnabled} onChange={event => onReferenceChange(event.target.checked)}
              aria-describedby={referenceEnabled ? "song-follow-reference-hint" : undefined} />
            {copy.reference}
          </label>
          {referenceEnabled && <p id="song-follow-reference-hint">{copy.referenceHint}</p>}
        </div>
        {progress.feedback && !finished && <button type="button" className="secondary-action" onClick={onReset}>{copy.reset}</button>}
      </div>

      <div className="song-follow-score">
        <h3 id="song-follow-sequence">{copy.sequence}</h3>
        <ol className="song-follow-steps" aria-labelledby="song-follow-sequence" tabIndex={0} ref={listRef}>
          {labels.map((label, index) => {
            const current = index === progress.matched;
            const matched = index < progress.matched;
            const state = matched ? "correct" : current ? (response === "wrong" ? "wrong" : "current") : "pending";
            return (
              <li key={index} className={`song-follow-step ${state}`} aria-current={current ? "step" : undefined}>
                <strong>{label.name}</strong>
                <small>{label.sounding}</small>
                <span className="song-follow-mark" aria-hidden="true">{matched ? "✓" : state === "wrong" ? "×" : ""}</span>
                <span className="sr-only">{copy[state]}</span>
              </li>
            );
          })}
        </ol>
      </div>

    </div>
  );
}
