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
    fingering: "Fingering from the mouthpiece down",
    closed: "Closed",
    half: "Half-open",
    open: "Open",
    repeated: "Tongue this note again or take a short breath.",
    complete: "Song complete",
    lessonComplete: "Lesson complete",
    correct: "Correct",
    wrong: "Try this step again",
    waiting: "Ready for a note",
    progress: "Notes matched",
    sequence: "Note sequence",
    score: "Song notes",
    lessonScore: "Lesson notes",
    attempts: "Your playing",
    pending: "Waiting",
    current: "Current step",
    guide: "Guide mode",
    guideHint: "The guide plays each note first. Play when you see “Your turn”.",
    hearNote: "Hear next note",
    guidePlaying: "Guide playing",
    guideReady: "Your turn",
    guideUnavailable: "Guide audio could not start. Try playing the note again.",
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
    fingering: "Ağızlıktan uca parmak dizilimi",
    closed: "Kapalı",
    half: "Yarım açık",
    open: "Açık",
    repeated: "Aynı notayı kısa bir aradan sonra yeniden üfle.",
    complete: "Şarkıyı tamamladın",
    lessonComplete: "Dersi tamamladın",
    correct: "Doğru",
    wrong: "Bu adımı tekrar dene",
    waiting: "Nota bekleniyor",
    progress: "Eşleşen notalar",
    sequence: "Nota sırası",
    score: "Şarkının notaları",
    lessonScore: "Dersin notaları",
    attempts: "Çaldıkların",
    pending: "Bekliyor",
    current: "Sıradaki adım",
    guide: "Rehber modu",
    guideHint: "Rehber önce sıradaki notayı çalar. “Sıra sende” yazdığında çal.",
    hearNote: "Sıradaki notayı dinle",
    guidePlaying: "Rehber çalıyor",
    guideReady: "Sıra sende",
    guideUnavailable: "Rehber sesi başlatılamadı. Notayı tekrar dinlemeyi dene.",
    unavailable: "Bu şarkı için çalınabilir bir yüksek Re nota dizisi bulunamadı.",
  },
};

export type GuidePhase = "idle" | "playing" | "ready" | "unavailable";

const EMPTY_FINGERING = ["open", "open", "open", "open", "open", "open"] as const;

export function FollowFingering({ holes, copy }: {
  holes: ReturnType<typeof describeLiveNote>["holes"];
  copy: (typeof songFollowCopy)["en" | "tr"];
}) {
  return (
    <div className="song-follow-note-holes" role={holes ? "img" : undefined}
      aria-label={holes ? [copy.fingering, ...holes.map(hole => copy[hole])].join(", ") : undefined}
      aria-hidden={holes ? undefined : true}>
      {(holes ?? EMPTY_FINGERING).map((hole, finger) => <span key={finger} className={`hole ${hole}`} aria-hidden="true" />)}
    </div>
  );
}

export function SongFollowPanel({
  language, steps, progress, guideEnabled, guidePhase, onGuideChange, onHearNote, replayDisabled, onReset, lesson = false,
}: {
  language: "en" | "tr";
  steps: FollowStep[];
  progress: FollowProgress;
  guideEnabled: boolean;
  guidePhase: GuidePhase;
  onGuideChange: (value: boolean) => void;
  onHearNote: () => void;
  replayDisabled: boolean;
  onReset: () => void;
  lesson?: boolean;
}) {
  const copy = songFollowCopy[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLOListElement>(null);
  const labels = useMemo(() => steps.map(step => describeLiveNote(step, language)), [steps, language]);
  const finished = progress.matched === steps.length;
  const repeated = progress.matched > 0 && !finished && steps[progress.matched - 1].midi === steps[progress.matched].midi;
  const heard = progress.feedback ? describeLiveNote(pitchAndOctave(progress.feedback.midi), language) : null;
  const response = progress.feedback ? (progress.feedback.correct ? "correct" : "wrong") : "ready";
  const guideStatus = guidePhase === "playing" ? copy.guidePlaying
    : guidePhase === "ready" ? copy.guideReady
      : guidePhase === "unavailable" ? copy.guideUnavailable : "";

  useEffect(() => {
    const scroll = scrollRef.current;
    const headers = headersRef.current;
    const note = scoreRef.current?.children[Math.min(progress.matched, steps.length - 1)];
    if (!scroll || !headers || !note) return;
    const noteBounds = note.getBoundingClientRect();
    const visibleTop = headers.getBoundingClientRect().bottom + 4;
    const visibleBottom = scroll.getBoundingClientRect().bottom - 4;
    if (noteBounds.top < visibleTop) scroll.scrollTop += noteBounds.top - visibleTop;
    else if (noteBounds.bottom > visibleBottom) scroll.scrollTop += noteBounds.bottom - visibleBottom;
  }, [progress.matched, steps.length]);

  return (
    <div className="song-follow">
      <div className="song-follow-status">
        <div className="song-follow-progress">
          <div className="song-follow-progress-heading">
            <span className="song-follow-label">{copy.progress}</span>
            <strong>{progress.matched} <span>/ {steps.length}</span></strong>
          </div>
          <progress max={steps.length} value={progress.matched} aria-label={copy.progress} />
        </div>
        <div className="song-follow-result">
          <div className={`song-follow-feedback ${response}`} role="status" aria-atomic="true">
            {heard && <span className="song-follow-feedback-note">{heard.name} <small>{heard.sounding}</small></span>}
            <span className="song-follow-feedback-status">{finished ? (lesson ? copy.lessonComplete : copy.complete) : response === "ready" ? copy.waiting : copy[response]}</span>
          </div>
          {repeated && <p>{copy.repeated}</p>}
        </div>
      </div>

      <div className="song-follow-options">
        <div className={`song-follow-guide${guideEnabled ? " enabled" : ""}`}>
          <div>
            <label className="song-follow-guide-toggle">
              <input type="checkbox" checked={guideEnabled} onChange={event => onGuideChange(event.target.checked)}
                aria-describedby={guideEnabled ? "song-follow-guide-hint" : undefined} />
              {copy.guide}
            </label>
            {guideEnabled && <p id="song-follow-guide-hint">{copy.guideHint}</p>}
          </div>
          {guideEnabled && !finished && (
            <div className="song-follow-guide-actions">
              <span className={`song-follow-guide-status ${guidePhase}`} role="status">{guideStatus}</span>
              <button type="button" className="secondary-action" onClick={onHearNote} disabled={replayDisabled}>{copy.hearNote}</button>
            </div>
          )}
        </div>
        {progress.feedback && !finished && <button type="button" className="secondary-action" onClick={onReset}>{copy.reset}</button>}
      </div>

      <div className="song-follow-score" role="region" aria-label={copy.sequence} tabIndex={0} ref={scrollRef}>
        <div className="song-follow-lane-headings" ref={headersRef}>
          <h3 id="song-follow-notes-title">{lesson ? copy.lessonScore : copy.score}</h3>
          <h3 id="song-follow-attempts-title">{copy.attempts}</h3>
        </div>
        <div className="song-follow-lanes">
          <ol className="song-follow-grid song-follow-notes" role="list" aria-labelledby="song-follow-notes-title" ref={scoreRef}>
            {labels.map((label, index) => {
              const current = index === progress.matched;
              return (
                <li key={index} className={`song-follow-tile song-follow-note${current ? " current" : ""}`} aria-current={current ? "step" : undefined}>
                  <span className="song-follow-position" aria-hidden="true">{index + 1}</span>
                  <FollowFingering holes={label.holes} copy={copy} />
                  <strong>{label.name}</strong>
                  <small>{label.sounding}</small>
                </li>
              );
            })}
          </ol>
          <ol className="song-follow-grid song-follow-attempts" role="list" aria-labelledby="song-follow-attempts-title">
            {labels.map((label, index) => {
              const current = index === progress.matched;
              const state = index < progress.matched ? "correct" : current ? (response === "wrong" ? "wrong" : "current") : "pending";
              const holes = state === "correct" ? label.holes : state === "wrong" ? heard?.holes ?? null : null;
              return (
                <li key={index} className={`song-follow-tile song-follow-attempt ${state}`} aria-current={current ? "step" : undefined}>
                  <span className="song-follow-position" aria-hidden="true">{index + 1}</span>
                  <FollowFingering holes={holes} copy={copy} />
                  {state === "correct" && <>
                    <strong>{label.name}</strong>
                    <small>{label.sounding}</small>
                  </>}
                  <span className="sr-only">{index + 1}. {copy[state]}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
